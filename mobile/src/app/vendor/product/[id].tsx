import { useMutation, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Platform, View } from 'react-native';

import { api, unwrap, upload } from '@/api/client';
import { money } from '@/lib/format';
import { color, radius, space } from '@/theme';
import { Button, Card, ErrorText, H2, Header, IconButton, Notice, Row, Screen, Skeleton, T, confirm } from '@/ui';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_VIDEO_MB = 100;

async function formFile(asset: ImagePicker.ImagePickerAsset, fallbackType: string): Promise<{ name: string; part: Blob | { uri: string; name: string; type: string } }> {
  const type = asset.mimeType ?? fallbackType;
  const name = asset.fileName ?? `upload.${type.split('/')[1] ?? 'bin'}`;
  if (Platform.OS === 'web') return { name, part: await (await fetch(asset.uri)).blob() };
  // React Native's FormData takes this shape for files on disk.
  return { name, part: { uri: asset.uri, name, type } };
}

/** Photos and the one video for a product. Uploads go straight to the API, which checks type and size again. */
export default function ProductMedia() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['seller', 'product', id], queryFn: () => unwrap(api.GET('/api/v1/seller/products/{product_id}', { params: { path: { product_id: id } } })) });

  const addPhoto = useMutation({
    mutationFn: async () => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [1, 1] });
      if (res.canceled) return null;
      const a = res.assets[0];
      if (a.mimeType && !IMAGE_TYPES.includes(a.mimeType)) throw new Error('Use a JPEG, PNG or WebP photo.');
      const f = await formFile(a, 'image/jpeg');
      const form = new FormData();
      form.append('file', f.part as Blob, f.name);
      form.append('alt', q.data?.title ?? '');
      return upload(`/seller/products/${id}/images`, form);
    },
    onSuccess: () => q.refetch(),
  });

  const removePhoto = useMutation({
    mutationFn: (imageId: string) => unwrap(api.DELETE('/api/v1/seller/products/{product_id}/images/{image_id}', { params: { path: { product_id: id, image_id: imageId } } })),
    onSuccess: () => q.refetch(),
  });

  const setVideo = useMutation({
    mutationFn: async () => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], videoMaxDuration: 120, quality: 1 });
      if (res.canceled) return null;
      const a = res.assets[0];
      if (a.fileSize && a.fileSize > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`Keep videos under ${MAX_VIDEO_MB} MB.`);
      const f = await formFile(a, 'video/mp4');
      const form = new FormData();
      form.append('file', f.part as Blob, f.name);
      return upload(`/seller/products/${id}/video`, form);
    },
    onSuccess: () => q.refetch(),
  });

  const removeVideo = useMutation({
    mutationFn: () => unwrap(api.DELETE('/api/v1/seller/products/{product_id}/video', { params: { path: { product_id: id } } })),
    onSuccess: () => q.refetch(),
  });

  const p = q.data;
  const err = addPhoto.error ?? removePhoto.error ?? setVideo.error ?? removeVideo.error;
  return (
    <View style={{ flex: 1, backgroundColor: color.mainBackground }}>
      <Header title={p?.title ?? 'Product'} subtitle={p?.price_cents != null ? money(p.price_cents, p.currency) : undefined} right={<IconButton icon="arrow-left" label="Back" tint="#fff" onPress={() => router.back()} />} />
      <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        {!p ? q.error ? <ErrorText>{q.error.message}</ErrorText> : <Skeleton rows={3} /> : null}
        {err ? <ErrorText>{err.message}</ErrorText> : null}
        {p ? (
          <>
            <H2>Photos ({p.images.length}/12)</H2>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              {p.images.map((im) => (
                <View key={im.id}>
                  <Image source={{ uri: im.url }} style={{ width: 100, height: 100, borderRadius: radius.element, backgroundColor: color.backgroundHover }} accessibilityLabel={im.alt ?? 'Product photo'} />
                  <View style={{ position: 'absolute', top: 0, right: 0 }}>
                    <IconButton
                      icon="close-circle"
                      label="Remove photo"
                      tint="#fff"
                      onPress={async () => (await confirm('Remove this photo?', 'Shoppers stop seeing it straight away.', 'Remove')) && removePhoto.mutate(im.id)}
                    />
                  </View>
                </View>
              ))}
            </View>
            <Button title="Add a photo" icon="image-plus" variant="secondary" onPress={() => addPhoto.mutate()} loading={addPhoto.isPending} disabled={p.images.length >= 12} />
            <H2>Video</H2>
            {p.video ? (
              <Card>
                <T>Video added{p.video.duration_s ? ` (${Math.round(p.video.duration_s)} s)` : ''}.</T>
                <Row gap={space.s}>
                  <Button title="Replace" variant="secondary" onPress={() => setVideo.mutate()} loading={setVideo.isPending} />
                  <Button title="Remove" variant="danger" onPress={async () => (await confirm('Remove the video?', 'You can add another one later.', 'Remove')) && removeVideo.mutate()} />
                </Row>
              </Card>
            ) : (
              <Button title="Add a video" icon="video-plus" variant="secondary" onPress={() => setVideo.mutate()} loading={setVideo.isPending} />
            )}
            <Notice text={`Short clips sell best: up to 2 minutes and ${MAX_VIDEO_MB} MB. Prices and stock are changed in the Stock tab or on the web dashboard.`} />
          </>
        ) : null}
      </Screen>
    </View>
  );
}
