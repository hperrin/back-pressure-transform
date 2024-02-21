import { PassThrough } from 'node:stream';
import fsp from 'node:fs/promises';

import BackPressureTransform from '.';

describe('BackPressureTransform', () => {
  it('transforms a stream', async () => {
    const stream = new PassThrough();

    const transform = new BackPressureTransform(async (chunk: Buffer) => {
      return Buffer.from(chunk.toString('utf8').toUpperCase(), 'utf8');
    });

    stream.pipe(transform.writable);

    let output = '';
    transform.readable.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });

    await new Promise((resolve) => {
      transform.readable.on('close', resolve);

      stream.write(Buffer.from('Hello, world.', 'utf8'));
      stream.end();
    });

    expect(output).toEqual('HELLO, WORLD.');
  });

  it('performs a flush', async () => {
    const stream = new PassThrough();

    const transform = new BackPressureTransform(
      async (chunk: Buffer) => {
        return Buffer.from(chunk.toString('utf8').toUpperCase(), 'utf8');
      },
      async () => {
        return Buffer.from(' The end.', 'utf8');
      }
    );

    stream.pipe(transform.writable);

    let output = '';
    transform.readable.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });

    await new Promise((resolve) => {
      transform.readable.on('close', resolve);

      stream.write(Buffer.from('Hello, world.', 'utf8'));
      stream.end();
    });

    expect(output).toEqual('HELLO, WORLD. The end.');
  });

  it('waits for back pressured stream to flush', async () => {
    // First read from urandom unthrottled.
    const unrestrictedHandle = await fsp.open('/dev/urandom', 'r');
    const unrestrictedStream = unrestrictedHandle.createReadStream({
      highWaterMark: 256,
    });
    let unrestrictedBytesTransformed = 0;

    const unrestrictedTransform = new PassThrough();

    unrestrictedTransform.on('data', (chunk) => {
      unrestrictedBytesTransformed += chunk.length;
    });

    unrestrictedStream.pipe(unrestrictedTransform);
    await new Promise((resolve) => setTimeout(resolve, 500));

    unrestrictedStream.destroy();
    unrestrictedTransform.end();
    await unrestrictedHandle.close();

    // Now read from urandom, and throttle the stream by applying back pressure.
    const handle = await fsp.open('/dev/urandom', 'r');
    const stream = handle.createReadStream({
      highWaterMark: 256,
    });
    let bytesTransformed = 0;

    const transform = new BackPressureTransform(async (chunk: Buffer) => {
      bytesTransformed += chunk.length;
      return chunk;
    });

    transform.readable.on('data', (_chunk) => {
      // Throttle data read to 256 bytes per 10 ms.
      transform.readable.pause();
      setTimeout(() => {
        if (!transform.readable.destroyed) {
          transform.readable.resume();
        }
      }, 10);
    });

    await new Promise(async (resolve) => {
      transform.readable.on('close', resolve);

      await new Promise((resolve) => {
        stream.pipe(transform.writable);
        setTimeout(resolve, 500);
      });

      stream.destroy();
      transform.writable.end();
      await handle.close();
    });

    // (500 ms / 10 ms per chunk) * 256 bytes per chunk
    expect(stream.bytesRead).toBeGreaterThanOrEqual((500 / 10) * 256); // Roughly
    // And include some buffer for the file read stream buffering.
    expect(stream.bytesRead).toBeLessThanOrEqual((500 / 10) * 256 * 4); // Roughly
    // It should certainly be less than an unthrottled stream read.
    expect(stream.bytesRead).toBeLessThan(unrestrictedStream.bytesRead);

    // Bytes transformed should be within one chunk of bytes read.
    expect(bytesTransformed).toBeLessThanOrEqual(stream.bytesRead);
    expect(bytesTransformed).toBeGreaterThanOrEqual(stream.bytesRead - 256);

    // And bytes transformed should be significantly less than unthrottled bytes
    // transformed. (At least on any relatively modern PC.)
    expect(bytesTransformed).toBeLessThan(unrestrictedBytesTransformed / 10);
  });
});
