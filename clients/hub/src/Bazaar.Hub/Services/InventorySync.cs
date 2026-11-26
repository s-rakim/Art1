using System.Globalization;
using System.Text;
using Bazaar.Api;

namespace Bazaar.Hub.Services;

public enum LineState { Change, Same, UnknownSku, Invalid }

public sealed record SyncLine(int Row, string Sku, string? Product, string? Option, Guid? VariantId,
    int? Current, int? Target, LineState State, string? Problem)
{
    public int Delta => (Target ?? 0) - (Current ?? 0);
}

public sealed record SyncPlan(IReadOnlyList<SyncLine> Lines)
{
    public IEnumerable<SyncLine> Changes => Lines.Where(l => l.State == LineState.Change);
    public int ChangeCount => Lines.Count(l => l.State == LineState.Change);
    public int ProblemCount => Lines.Count(l => l.State is LineState.UnknownSku or LineState.Invalid);
}

/// <summary>
/// Bulk stock updates from a spreadsheet, a point-of-sale export or an ERP.
/// The file needs a "sku" column and either "stock" (set the count) or "adjust" (move it by).
/// Nothing is sent until the vendor has seen the plan and pressed apply.
/// </summary>
public static class InventorySync
{
    public const int MaxRows = 5000;
    public const int BatchSize = 200; // the API accepts up to 200 changes per call

    public sealed record ParsedRow(int Row, string Sku, int? Stock, int? Adjust, string? Problem);

    public static List<ParsedRow> Parse(string text)
    {
        var rows = new List<ParsedRow>();
        var lines = ReadCsv(text).ToList();
        if (lines.Count == 0) return rows;
        var header = lines[0].Select(h => h.Trim().ToLowerInvariant()).ToList();
        int sku = header.FindIndex(h => h is "sku" or "variant_sku" or "code");
        int stock = header.FindIndex(h => h is "stock" or "quantity" or "qty" or "on_hand");
        int adjust = header.FindIndex(h => h is "adjust" or "adjust_by" or "change");
        if (sku < 0 || (stock < 0 && adjust < 0))
            throw new FormatException("The first row must name the columns: \"sku\" and \"stock\" (or \"adjust\").");

        foreach (var (cells, i) in lines.Skip(1).Select((c, i) => (c, i + 2)))
        {
            if (cells.All(string.IsNullOrWhiteSpace)) continue;
            if (rows.Count >= MaxRows) throw new FormatException($"Keep files under {MaxRows} rows.");
            string Cell(int idx) => idx >= 0 && idx < cells.Count ? cells[idx].Trim() : "";
            var s = Cell(sku);
            int? st = null, adj = null;
            string? problem = null;
            if (s.Length is 0 or > 64) problem = "Missing or too long SKU.";
            if (stock >= 0 && Cell(stock) is { Length: > 0 } sv)
            {
                if (int.TryParse(sv, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) && n is >= 0 and <= 1_000_000) st = n;
                else problem ??= $"\"{Truncate(sv)}\" isn't a stock count from 0 to 1,000,000.";
            }
            if (adjust >= 0 && Cell(adjust) is { Length: > 0 } av)
            {
                if (int.TryParse(av, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var n) && Math.Abs(n) <= 1_000_000) adj = n;
                else problem ??= $"\"{Truncate(av)}\" isn't a whole number.";
            }
            if (problem is null && st is null && adj is null) problem = "No stock or adjust value.";
            if (problem is null && st is not null && adj is not null) problem = "Give stock or adjust, not both.";
            rows.Add(new ParsedRow(i, s, st, adj, problem));
        }
        return rows;
    }

    public static SyncPlan Plan(IEnumerable<ParsedRow> rows, IReadOnlyCollection<InventoryRow> current)
    {
        var bySku = current.GroupBy(r => r.Sku, StringComparer.OrdinalIgnoreCase)
                           .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var lines = new List<SyncLine>();
        foreach (var r in rows)
        {
            if (r.Problem is not null) { lines.Add(new(r.Row, r.Sku, null, null, null, null, null, LineState.Invalid, r.Problem)); continue; }
            if (!seen.Add(r.Sku)) { lines.Add(new(r.Row, r.Sku, null, null, null, null, null, LineState.Invalid, "This SKU appears twice in the file.")); continue; }
            if (!bySku.TryGetValue(r.Sku, out var inv)) { lines.Add(new(r.Row, r.Sku, null, null, null, null, null, LineState.UnknownSku, "No product option has this SKU.")); continue; }
            var target = r.Stock ?? inv.Stock + r.Adjust!.Value;
            if (target < 0) { lines.Add(new(r.Row, r.Sku, inv.Product_title, inv.Title, inv.Variant_id, inv.Stock, target, LineState.Invalid, "That would take stock below zero.")); continue; }
            lines.Add(new(r.Row, r.Sku, inv.Product_title, inv.Title, inv.Variant_id, inv.Stock, target,
                target == inv.Stock ? LineState.Same : LineState.Change, null));
        }
        return new SyncPlan(lines);
    }

    /// <summary>Changes as API batches. Sets the exact count: the plan was made from fresh numbers.</summary>
    public static IEnumerable<InventoryUpdateIn> Batches(SyncPlan plan, string reason) =>
        plan.Changes.Chunk(BatchSize).Select(chunk => new InventoryUpdateIn
        {
            Items = chunk.Select(l => new StockChange { Variant_id = l.VariantId!.Value, Stock = l.Target, Reason = reason }).ToList(),
        });

    public static async Task<List<InventoryRow>> LoadAllAsync(BazaarApiClient api, CancellationToken ct)
    {
        var all = new List<InventoryRow>();
        for (var page = 1; page <= 100; page++)
        {
            var p = await api.SellerInventoryAsync(page: page, page_size: 100, cancellationToken: ct);
            all.AddRange(p.Items);
            if (all.Count >= p.Total || p.Items.Count == 0) break;
        }
        return all;
    }

    public static string ToCsv(IEnumerable<InventoryRow> rows)
    {
        var sb = new StringBuilder("sku,product,option,price,stock,reserved,sold_30d\n");
        foreach (var r in rows)
            sb.Append(Csv(r.Sku)).Append(',').Append(Csv(r.Product_title)).Append(',').Append(Csv(r.Title)).Append(',')
              .Append((r.Price_cents / 100m).ToString("0.00", CultureInfo.InvariantCulture)).Append(',')
              .Append(r.Stock).Append(',').Append(r.Reserved).Append(',').Append(r.Sold_30d).Append('\n');
        return sb.ToString();
    }

    /// <summary>A CSV cell, quoted when needed and defused against spreadsheet formula injection.</summary>
    public static string Csv(string? value)
    {
        var v = value ?? "";
        if (v.Length > 0 && "=+-@\t\r".Contains(v[0])) v = "'" + v;
        return v.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? "\"" + v.Replace("\"", "\"\"") + "\"" : v;
    }

    private static string Truncate(string s) => s.Length > 20 ? s[..20] + "…" : s;

    private static IEnumerable<List<string>> ReadCsv(string text)
    {
        var row = new List<string>();
        var cell = new StringBuilder();
        bool quoted = false;
        char delimiter = DetectDelimiter(text);
        for (int i = 0; i < text.Length; i++)
        {
            char c = text[i];
            if (quoted)
            {
                if (c == '"' && i + 1 < text.Length && text[i + 1] == '"') { cell.Append('"'); i++; }
                else if (c == '"') quoted = false;
                else cell.Append(c);
            }
            else if (c == '"' && cell.Length == 0) quoted = true;
            else if (c == delimiter) { row.Add(cell.ToString()); cell.Clear(); }
            else if (c == '\n' || c == '\r')
            {
                if (c == '\r' && i + 1 < text.Length && text[i + 1] == '\n') i++;
                row.Add(cell.ToString()); cell.Clear();
                yield return row;
                row = new List<string>();
            }
            else if (c != '﻿') cell.Append(c);
        }
        if (cell.Length > 0 || row.Count > 0) { row.Add(cell.ToString()); yield return row; }
    }

    private static char DetectDelimiter(string text)
    {
        var first = text.Split('\n', 2)[0];
        return first.Count(c => c == ';') > first.Count(c => c == ',') ? ';' : first.Contains('\t') && !first.Contains(',') ? '\t' : ',';
    }
}
