"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ErrorLine, PageTitle } from "@/components/dash";
import { ArrowLeft, ArrowRight, Delete, ImageIcon, Swap, Video } from "@/components/icons";
import { StatusTag } from "@/components/status-tag";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FileDropzone, UploadProgress } from "@/components/ui/file-dropzone";
import {
  api, ApiError, PHOTO_ACCEPT, PHOTO_MAX_BYTES, VIDEO_ACCEPT, VIDEO_MAX_BYTES, type SellerProductDetail,
} from "@/lib/api";
import { money } from "@/lib/format";
import { safeImageUrl } from "@/lib/safe";
import { useChanged } from "@/lib/hooks";
import { useApi } from "@/lib/use-api";

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/**
 * One listing: its photos, its video, and stock and price per variant. Each section saves on
 * its own, so a slow video upload never holds up a stock change.
 */
export default function EditProduct() {
  const { id } = useParams<{ id: string }>();
  const created = useSearchParams().get("created") === "1";
  const { data: product, setData, error, token } = useApi((t) => api.sellerProduct(t, id), [id]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function setStatus(status: "active" | "draft") {
    setBusy(true);
    setMsg(null);
    try {
      const p = await api.updateProduct(token, id, { status });
      setData((d) => (d ? { ...d, status: p.status ?? status } : d));
    } catch (e) {
      setMsg(errText(e, "Couldn't change the listing."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <Link href="/seller/products" className="mb-3 inline-flex items-center gap-1 text-[14px] text-maxcontrast hover:text-main-text"><ArrowLeft size={18} /> All products</Link>
      <PageTitle
        kicker={product ? `${product.variants.length} variant${product.variants.length === 1 ? "" : "s"} · ${product.images.length} photo${product.images.length === 1 ? "" : "s"}${product.video ? " · video" : ""}` : "Loading"}
        title={product?.title ?? "Product"}
        action={
          product && (
            <div className="flex flex-wrap items-center gap-2">
              <StatusTag status={product.status} />
              {product.status === "active" ? (
                <>
                  <Link href={`/p/${product.slug}`} className="btn btn-tertiary btn-sm">View in shop</Link>
                  <button disabled={busy} onClick={() => setStatus("draft")} className="btn btn-secondary btn-sm">Hide</button>
                </>
              ) : (
                <button disabled={busy} onClick={() => setStatus("active")} className="btn btn-primary btn-sm">Publish</button>
              )}
            </div>
          )
        }
      />
      {created && product && product.images.length === 0 && (
        <p role="status" className="mb-4 rounded-element bg-info px-4 py-3 text-[14px] text-info-text">
          Saved. Add photos and a video below; the first photo becomes the cover shoppers see.
        </p>
      )}
      <ErrorLine error={error ?? msg} />
      {product && (
        <div className="space-y-6">
          <Photos product={product} token={token} onChange={setData} />
          <VideoSection product={product} token={token} onChange={setData} />
          <Stock product={product} token={token} onChange={setData} />
        </div>
      )}
    </div>
  );
}

type SectionProps = { product: SellerProductDetail; token: string | null; onChange: (p: SellerProductDetail) => void };

function Section({ title, note, icon, children }: { title: string; note?: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-container border border-border-dark bg-main-background p-5">
      <div className="mb-4 flex items-start gap-3">
        <span aria-hidden className="mt-0.5 text-primary-element">{icon}</span>
        <div>
          <h2 className="heading text-[18px]">{title}</h2>
          {note ? <p className="mt-0.5 text-[13px] text-maxcontrast text-pretty">{note}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

// ---------- photos ----------

type Job = { key: string; file: File; progress: number; error: string | null };

function Photos({ product, token, onChange }: SectionProps) {
  const images = product.images;
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [alts, setAlts] = useState<Record<string, string>>({});
  const room = 12 - images.length - jobs.filter((j) => !j.error).length;

  useEffect(() => {
    setAlts(Object.fromEntries(images.map((i) => [i.id, i.alt ?? ""])));
  }, [images]);

  async function run(job: Job) {
    setJobs((js) => js.map((j) => (j.key === job.key ? { ...j, error: null, progress: 0 } : j)));
    try {
      const next = await api.addProductImage(token, product.id, job.file, product.title, (p) =>
        setJobs((js) => js.map((j) => (j.key === job.key ? { ...j, progress: p } : j))),
      );
      onChange(next);
      setJobs((js) => js.filter((j) => j.key !== job.key));
    } catch (e) {
      setJobs((js) => js.map((j) => (j.key === job.key ? { ...j, error: errText(e, "Upload failed.") } : j)));
    }
  }

  async function add(files: File[]) {
    const fresh = files.slice(0, Math.max(0, room)).map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, progress: 0, error: null }));
    if (files.length > fresh.length) setError(`A listing holds 12 photos. ${files.length - fresh.length} didn't fit.`);
    setJobs((js) => [...js, ...fresh]);
    for (const job of fresh) await run(job); // one at a time keeps phones on slow data responsive
  }

  async function act(key: string, fn: () => Promise<SellerProductDetail>, fallback: string) {
    setBusy(key);
    setError(null);
    try {
      onChange(await fn());
    } catch (e) {
      setError(errText(e, fallback));
    } finally {
      setBusy(null);
    }
  }

  const move = (from: number, to: number) => {
    const ids = images.map((i) => i.id);
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x);
    return act(`move-${x}`, () => api.reorderImages(token, product.id, ids), "Couldn't reorder the photos.");
  };

  return (
    <Section title={`Photos (${images.length}/12)`} note="The first photo is the cover. Photos are resized and cleaned of location data when they upload." icon={<ImageIcon size={22} />}>
      {images.length > 0 && (
        <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => {
            const src = safeImageUrl(img.url);
            return (
              <li key={img.id} className="flex flex-col overflow-hidden rounded-element border border-border-dark">
                <div className="relative aspect-[4/5] bg-background-hover">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {src && <img src={src} alt={img.alt ?? ""} className="size-full object-cover" referrerPolicy="no-referrer" />}
                  {i === 0 && <span className="chip chip-primary absolute top-2 left-2">Cover</span>}
                </div>
                <div className="space-y-2 p-2">
                  <label className="block">
                    <span className="sr-only">Describe photo {i + 1}</span>
                    <input
                      className="field h-8 text-[13px]"
                      placeholder="Describe it for screen readers"
                      maxLength={200}
                      value={alts[img.id] ?? ""}
                      onChange={(e) => setAlts((a) => ({ ...a, [img.id]: e.target.value }))}
                      onBlur={() => {
                        if ((alts[img.id] ?? "") !== (img.alt ?? "")) act(`alt-${img.id}`, () => api.setImageAlt(token, product.id, img.id, alts[img.id] ?? ""), "Couldn't save the description.");
                      }}
                    />
                  </label>
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={i === 0 || !!busy} onClick={() => move(i, i - 1)} className="btn btn-tertiary btn-sm btn-icon" aria-label={`Move photo ${i + 1} earlier`}><ArrowLeft size={18} /></button>
                    <button type="button" disabled={i === images.length - 1 || !!busy} onClick={() => move(i, i + 1)} className="btn btn-tertiary btn-sm btn-icon" aria-label={`Move photo ${i + 1} later`}><ArrowRight size={18} /></button>
                    <label className={`btn btn-tertiary btn-sm btn-icon cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary-element ${busy ? "pointer-events-none opacity-50" : ""}`} title="Replace">
                      <Swap size={18} />
                      <span className="sr-only">Replace photo {i + 1}</span>
                      <input
                        type="file"
                        accept={PHOTO_ACCEPT}
                        className="sr-only"
                        disabled={!!busy}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) act(`replace-${img.id}`, () => api.replaceProductImage(token, product.id, img.id, f, img.alt ?? product.title), "Couldn't replace the photo.");
                        }}
                      />
                    </label>
                    <button type="button" disabled={!!busy} onClick={() => setRemoving(img.id)} className="btn btn-tertiary btn-sm btn-icon ml-auto text-text-error" aria-label={`Remove photo ${i + 1}`}><Delete size={18} /></button>
                  </div>
                  {busy?.endsWith(img.id) && <p className="text-[12px] text-maxcontrast" role="status">Saving…</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {jobs.length > 0 && (
        <ul className="mb-4 space-y-2" aria-label="Uploads">
          {jobs.map((j) => (
            <li key={j.key} className="rounded-element border border-border px-3 py-2 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate">{j.file.name}</span>
                {j.error ? (
                  <span className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => run(j)} className="link-u">Try again</button>
                    <button type="button" onClick={() => setJobs((js) => js.filter((x) => x.key !== j.key))} className="link-u text-maxcontrast">Dismiss</button>
                  </span>
                ) : (
                  <span className="shrink-0 tabular-nums text-maxcontrast">{Math.round(j.progress * 100)}%</span>
                )}
              </div>
              {j.error ? <p className="mt-1 text-text-error">{j.error}</p> : <div className="mt-2"><UploadProgress value={j.progress} label={`Uploading ${j.file.name}`} /></div>}
            </li>
          ))}
        </ul>
      )}

      {room > 0 && (
        <FileDropzone
          accept={PHOTO_ACCEPT}
          maxBytes={PHOTO_MAX_BYTES}
          multiple
          label={images.length ? "Add more photos" : "Add photos"}
          hint={`Drop them here or choose files. JPEG, PNG, WebP or AVIF, up to 10 MB each. ${room} more fit.`}
          onFiles={add}
        />
      )}
      <ErrorLine error={error} />
      <ConfirmDialog
        open={removing !== null}
        title="Remove this photo?"
        confirm="Remove photo"
        busy={busy === `delete-${removing}`}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          const target = removing;
          if (!target) return;
          await act(`delete-${target}`, () => api.deleteProductImage(token, product.id, target), "Couldn't remove the photo.");
          setRemoving(null);
        }}
      >
        Shoppers stop seeing it straight away. You can upload it again later.
      </ConfirmDialog>
    </Section>
  );
}

// ---------- video ----------

/** Reads a clip's length in the browser so a too-long video is caught before it uploads. */
function durationOf(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = url;
  });
}

function VideoSection({ product, token, onChange }: SectionProps) {
  const video = product.video ?? null;
  const [file, setFile] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [caption, setCaption] = useState(video?.caption ?? "");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  const src = video ? safeImageUrl(video.url) : null;
  const posterSrc = video?.poster_url ? safeImageUrl(video.poster_url) : null;

  async function pick(files: File[]) {
    const f = files[0];
    setError(null);
    const d = await durationOf(f);
    if (d !== null && d > 180) {
      setError(`That clip runs ${Math.floor(d / 60)} min ${Math.round(d % 60)} s. Videos can be 3 minutes at most.`);
      return;
    }
    setFile(f);
  }

  async function send() {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      const next = await api.setProductVideo(token, product.id, file, { poster, caption }, setProgress);
      onChange(next);
      setFile(null);
      setPoster(null);
      setReplacing(false);
    } catch (e) {
      setError(errText(e, "The video didn't upload. Try again."));
    } finally {
      setProgress(null);
    }
  }

  const form = (
    <div className="space-y-3">
      {!file ? (
        <FileDropzone
          accept={VIDEO_ACCEPT}
          maxBytes={VIDEO_MAX_BYTES}
          label={video ? "Choose a new video" : "Add a video"}
          hint="MP4, MOV or WebM, up to 50 MB and 3 minutes. Show the item being worn or used."
          icon={<Video size={24} />}
          onFiles={pick}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr]">
          {preview && <video src={preview} controls muted playsInline preload="metadata" className="aspect-video w-full rounded-element bg-black" />}
          <div className="space-y-3">
            <p className="text-[14px]"><span className="font-semibold">{file.name}</span> <span className="tabular-nums text-maxcontrast">{(file.size / (1024 * 1024)).toFixed(1)} MB</span></p>
            <label className="block">
              <span className="label">Caption (optional)</span>
              <input className="field mt-1" maxLength={300} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Model is 5′8″ wearing size M" />
            </label>
            <label className="block">
              <span className="label">Cover picture (optional)</span>
              <input type="file" accept={PHOTO_ACCEPT} className="mt-1 block text-[13px]" onChange={(e) => setPoster(e.target.files?.[0] ?? null)} />
              <span className="mt-1 block text-[12px] text-maxcontrast">Shown before the video plays. Without one, shoppers see the first frame.</span>
            </label>
            {progress !== null && (
              <div className="space-y-1">
                <UploadProgress value={progress} label="Uploading video" />
                <p className="text-[12px] tabular-nums text-maxcontrast" aria-live="polite">{progress < 1 ? `Uploading, ${Math.round(progress * 100)}%` : "Checking the file…"}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={progress !== null} onClick={send} className="btn btn-primary">{video ? "Replace video" : "Upload video"}</button>
              <button type="button" disabled={progress !== null} onClick={() => setFile(null)} className="btn btn-tertiary">Choose another</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Section title="Video" note="One clip per listing, next to the photos. Shoppers tap play; it never starts on its own." icon={<Video size={22} />}>
      {video && !replacing ? (
        <div className="grid gap-4 md:grid-cols-[minmax(0,420px)_1fr]">
          <figure>
            {src && (
              <video controls playsInline preload="metadata" poster={posterSrc ?? undefined} className="aspect-video w-full rounded-element bg-black">
                <source src={src} type={video.content_type} />
              </video>
            )}
            {video.caption && <figcaption className="mt-2 text-[13px] text-maxcontrast">{video.caption}</figcaption>}
          </figure>
          <div className="space-y-2 text-[14px]">
            {video.duration_s != null && <p className="tabular-nums text-maxcontrast">{Math.floor(video.duration_s / 60)}:{String(Math.round(video.duration_s % 60)).padStart(2, "0")} long</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setReplacing(true)} className="btn btn-secondary"><Swap size={18} /> Replace</button>
              <button type="button" onClick={() => setRemoving(true)} className="btn btn-tertiary text-text-error"><Delete size={18} /> Remove</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {form}
          {replacing && !file && <button type="button" onClick={() => setReplacing(false)} className="btn btn-tertiary mt-2">Keep the current video</button>}
        </>
      )}
      <ErrorLine error={error} />
      <ConfirmDialog
        open={removing}
        title="Remove the video?"
        confirm="Remove video"
        busy={busy}
        onClose={() => setRemoving(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            onChange(await api.deleteProductVideo(token, product.id));
            setRemoving(false);
          } catch (e) {
            setError(errText(e, "Couldn't remove the video."));
          } finally {
            setBusy(false);
          }
        }}
      >
        The listing keeps its photos. You can add a new video any time.
      </ConfirmDialog>
    </Section>
  );
}

// ---------- stock and price ----------

type Row = { stock: string; price: string };

function Stock({ product, token, onChange }: SectionProps) {
  const initial = useMemo(
    () => Object.fromEntries(product.variants.map((v) => [v.id, { stock: String(v.stock), price: (v.price_cents / 100).toFixed(2) }])) as Record<string, Row>,
    [product.variants],
  );
  const [rows, setRows] = useState(initial);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const reloaded = useChanged(initial);
  if (reloaded) setRows(initial);

  const changed = product.variants.filter((v) => rows[v.id] && (rows[v.id].stock !== String(v.stock) || rows[v.id].price !== (v.price_cents / 100).toFixed(2)));

  async function save() {
    setMsg(null);
    const stock = changed.filter((v) => rows[v.id].stock !== String(v.stock));
    const price = changed.filter((v) => rows[v.id].price !== (v.price_cents / 100).toFixed(2));
    const badStock = stock.find((v) => !/^\d{1,7}$/.test(rows[v.id].stock));
    if (badStock) return setMsg({ ok: false, text: `Stock for ${badStock.title} must be a whole number.` });
    const badPrice = price.find((v) => !/^\d{1,7}(\.\d{1,2})?$/.test(rows[v.id].price) || parseFloat(rows[v.id].price) <= 0);
    if (badPrice) return setMsg({ ok: false, text: `Price for ${badPrice.title} must be above zero, like 24.99.` });
    setBusy(true);
    try {
      if (stock.length) {
        await api.updateInventory(token, stock.map((v) => ({ variant_id: v.id, stock: parseInt(rows[v.id].stock, 10), reason: reason.trim().slice(0, 200) || null })));
      }
      for (const v of price) await api.updateVariant(token, v.id, { price_cents: Math.round(parseFloat(rows[v.id].price) * 100) });
      onChange(await api.sellerProduct(token, product.id));
      setReason("");
      setMsg({ ok: true, text: `Saved ${changed.length} variant${changed.length === 1 ? "" : "s"}. Shoppers see the change straight away.` });
    } catch (e) {
      setMsg({ ok: false, text: errText(e, "Couldn't save. Nothing was changed.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Stock and prices" note="Stock changes are saved together and kept in your inventory history with the reason you give." icon={<Swap size={22} />}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[14px]">
          <thead>
            <tr className="border-b border-border text-left text-[12px] text-maxcontrast">
              <th className="py-2 pr-3 font-normal">Variant</th>
              <th className="py-2 pr-3 font-normal">SKU</th>
              <th className="w-32 py-2 pr-3 font-normal">Price ({product.currency})</th>
              <th className="w-28 py-2 font-normal">In stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {product.variants.map((v) => {
              const r = rows[v.id] ?? { stock: "", price: "" };
              const dirty = r.stock !== String(v.stock) || r.price !== (v.price_cents / 100).toFixed(2);
              return (
                <tr key={v.id} className={dirty ? "bg-primary-element-light/40" : ""}>
                  <td className="py-2 pr-3">{v.title}{!v.is_active && <span className="ml-2 text-[12px] text-maxcontrast">(hidden)</span>}</td>
                  <td className="py-2 pr-3 tabular-nums text-[13px] text-maxcontrast">{v.sku}</td>
                  <td className="py-2 pr-3">
                    <input className="field h-9 tabular-nums" inputMode="decimal" aria-label={`Price for ${v.title}`} value={r.price} onChange={(e) => setRows((x) => ({ ...x, [v.id]: { ...r, price: e.target.value.replace(/[^\d.]/g, "") } }))} />
                  </td>
                  <td className="py-2">
                    <input className={`field h-9 tabular-nums ${Number(r.stock) === 0 ? "text-text-error" : ""}`} inputMode="numeric" aria-label={`Stock for ${v.title}`} value={r.stock} onChange={(e) => setRows((x) => ({ ...x, [v.id]: { ...r, stock: e.target.value.replace(/\D/g, "").slice(0, 7) } }))} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block min-w-[220px] flex-1">
          <span className="label">Reason (optional)</span>
          <input className="field mt-1" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Restock from supplier" />
        </label>
        <button type="button" disabled={busy || changed.length === 0} onClick={save} className="btn btn-primary">
          {busy ? "Saving…" : changed.length ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}` : "No changes"}
        </button>
      </div>
      {changed.length > 0 && <p className="mt-2 text-[12px] text-maxcontrast tabular-nums">From {money(Math.min(...product.variants.map((v) => v.price_cents)), product.currency)} before these changes.</p>}
      {msg && <p role="status" className={`mt-3 border-l-2 pl-3 text-[13px] ${msg.ok ? "border-element-success text-text-success" : "border-element-error text-text-error"}`}>{msg.text}</p>}
    </Section>
  );
}
