# @sciactive/back-pressure-transform - Back Pressure Transform

A back pressure aware Transform stream for Node.js.

## Install

```sh
npm i -s @sciactive/back-pressure-transform
```

## Usage

```ts
import type { Readable } from 'node:stream';

import BackPressureTransform from 'back-pressure-transform';

function getTransformedStream(stream: Readable): Readable {
  const transformedStream = new BackPressureTransform(
    // Transform callback.
    async (chunk) => {
      // Do something to chunk.
      // You can transform it, replace it, or discard it.

      return chunk;
    },

    // Final callback.
    async () => {
      // Return any extra data to go onto the end of the stream.

      return Buffer.from('All done!', 'utf8');
    }
  );

  stream.pipe(transformedStream.writable);

  // When one errors, propagate that to the other.
  stream.on('error', (err) => {
    if (!transformedStream.writable.destroyed) {
      transformedStream.writable.destroy(err);
    }
  });
  transformedStream.writable.on('error', (err) => {
    if (!stream.destroyed) {
      stream.destroy(err);
    }
  });

  return transformedStream.readable;
}
```

# License

Copyright 2024 SciActive Inc

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
