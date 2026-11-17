// Phone test 17/11 (AAB 1002850): choosing an avatar always ended with "Không kết nối được máy chủ FET3D" while the rest of
// the app worked. Expo 57 replaces the global fetch with expo/fetch, and its FormData encoder throws on a React Native
// `{ uri, name, type }` part before anything is sent; apiClient turns that throw into the lost-connection message.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const { avatarFormPart } = await import('../src/api/auth.ts?real');
// Expo's own encoder, loaded from its installed source (Node does not strip types under node_modules by itself).
const encoderSource = await readFile(
  new URL('../node_modules/expo/src/winter/fetch/convertFormData.ts', import.meta.url),
  'utf8',
);
const { convertFormDataAsync } = await import(
  'data:text/javascript,' +
    encodeURIComponent(
      stripTypeScriptTypes(encoderSource).replace(
        /import \{ blobToArrayBufferAsync \} from '[^']+';/,
        'const blobToArrayBufferAsync = (blob) => blob.arrayBuffer();',
      ),
    )
);

const fs = globalThis.__fs;
const PICKED = 'file:///data/user/0/com.fet3d.app/cache/ImagePicker/3f2a.jpeg';

function formOf(part) {
  return { entries: () => [['file', part]] };
}

test('expo/fetch rejects the React Native uri part the app used to send', async () => {
  await assert.rejects(
    convertFormDataAsync(formOf({ uri: PICKED, name: 'avatar.jpg', type: 'image/jpeg' }), 'B'),
    /Unsupported FormDataPart implementation/,
  );
});

test('the avatar part is encoded by expo/fetch with the picked bytes, our file name and content type', async () => {
  fs.reset();
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  fs.files.set('/data/user/0/com.fet3d.app/cache/ImagePicker/3f2a.jpeg', jpeg);

  const part = avatarFormPart(PICKED, 'image/jpeg');
  assert.equal('uri' in part, false);
  const { body } = await convertFormDataAsync(formOf(part), 'B');
  const text = new TextDecoder('latin1').decode(body);

  assert.match(text, /content-disposition: form-data; name="file"; filename="avatar\.jpg"\r\n/);
  assert.match(text, /content-type: image\/jpeg\r\n\r\n/);
  const start = text.indexOf('\r\n\r\n') + 4;
  assert.deepEqual([...body.slice(start, start + jpeg.length)], [...jpeg]);
  assert.ok(text.endsWith('--B--\r\n'));
});

test('png and webp keep their own extension', () => {
  assert.equal(avatarFormPart(PICKED, 'image/png').name, 'avatar.png');
  assert.equal(avatarFormPart(PICKED, 'image/webp').name, 'avatar.webp');
});
