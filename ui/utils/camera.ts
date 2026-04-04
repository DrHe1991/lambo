import { Capacitor } from '@capacitor/core';

/**
 * Take a photo using the device camera.
 * Native: uses Capacitor Camera plugin.
 * Web: falls back to file input with capture attribute.
 * Returns a File object ready for upload, or null if cancelled.
 */
export async function takePhoto(): Promise<File | null> {
  if (Capacitor.isNativePlatform()) {
    return takePhotoNative();
  }
  return takePhotoWeb();
}

async function takePhotoNative(): Promise<File | null> {
  // Variable import path defeats Vite's static analysis — only runs on native
  const pkg = '@capacitor/camera';
  const { Camera, CameraResultType, CameraSource } = await import(/* @vite-ignore */ pkg);
  try {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      quality: 80,
      width: 1920,
      allowEditing: false,
    });

    if (!photo.dataUrl) return null;

    const res = await fetch(photo.dataUrl);
    const blob = await res.blob();
    const ext = photo.format || 'jpeg';
    return new File([blob], `camera-${Date.now()}.${ext}`, { type: `image/${ext}` });
  } catch {
    return null;
  }
}

function takePhotoWeb(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      resolve(file);
    };
    // User cancelled
    window.addEventListener('focus', () => {
      setTimeout(() => {
        if (!input.files?.length) resolve(null);
      }, 500);
    }, { once: true });
    input.click();
  });
}
