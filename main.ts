console.log(Deno.env.get("HTTP_PROXY"));

const client = Deno.env.has("HTTP_PROXY")
  ? Deno.createHttpClient({
    proxy: { url: Deno.env.get("HTTP_PROXY") as string },
  })
  : Deno.createHttpClient({});

async function httpfetch(
  input: RequestInfo | URL,
  init?: RequestInit & {
    client?: Deno.HttpClient;
    timeout?: number;
    throw: boolean;
  },
): Promise<Response> {
  let resp;

  if (init?.timeout != null) {
    const controller = new AbortController();
    const timeoutMs = init?.timeout;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      resp = await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } else {
    resp = await fetch(input, init);
  }

  const code = resp.status;
  if ((init?.throw == true) && code != 200) {
    throw `HttpError: status=${code}`;
  }

  return resp;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise<void>((resolve, _) => {
    setTimeout(() => resolve(), delayMs);
  });
}

function retry<T>(
  f: () => Promise<T>,
  options: { limit: number } = { limit: 0 },
): Promise<T> {
  async function aux<T>(
    f: () => Promise<T>,
    count: number,
  ): Promise<T> {
    try {
      return await f();
    } catch (e) {
      if (count == options.limit) {
        throw e;
      } else {
        const delayMs = Math.floor(200 + Math.random() * 2000);
        console.log(`Retry #${count + 1} after ${delayMs}ms`);
        await sleep(delayMs);
        return aux(f, count + 1);
      }
    }
  }
  return aux(f, 0);
}

const pattern =
  /<a.+?class="text-secondary group-hover:text-primary".+?>\s+?(\S+?)\s+.+?<\/a>/gs;

function extractBango(
  html: string,
): IteratorObject<string, undefined, unknown> {
  return html.matchAll(pattern).map((m) => m[1]);
}

async function fetchBango(
  name: string,
  page: number = 1,
): Promise<Array<string>> {
  const url = `https://missav.ai/dm77/cn/actresses/${name}?page=${page}`;
  console.log(`Fetching bango for "${name}" page=${page} url=${url}`);

  const resp = await httpfetch(url, {
    client: client,
    timeout: 3000,
    throw: true,
  });

  const html = await resp.text();
  // console.log(html);
  return extractBango(html).toArray();
}

async function* bangoGen(name: string) {
  let page = 1;
  while (true) {
    const list = await retry(() => fetchBango(name, page), { limit: 3 });
    if (list.length == 0) {
      break;
    }
    for (const e of list) {
      yield e;
    }
    page++;
  }
}

async function* nameGen() {
  const text = await Deno.readTextFile("artist.txt");
  for (const line of text.split("\n")) {
    const name = line.trim();
    if (name.length > 0) {
      yield name;
    }
  }
}

async function main(_args: Array<string>): Promise<void> {
  const outFile = "bango.txt";
  const out = await Deno.create(outFile);
  let error;
  try {
    const enc = new TextEncoder();
    for await (const name of nameGen()) {
      console.log(`=== ${name} ===`);
      await out.write(enc.encode(`=== ${name} ===\n`));
      // TODO: uniq
      for await (const bango of bangoGen(name)) {
        console.log(bango);
        await out.write(enc.encode(bango + "\n"));
      }
    }
  } catch (e) {
    error = e;
  } finally {
    out.close();
    if (error != null) {
      await Deno.remove(outFile);
    }
  }
}

if (import.meta.main) {
  main(Deno.args);
}
