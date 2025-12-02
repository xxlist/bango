// const proxyUrl = "http://localhost:9933";
// const client = Deno.createHttpClient({ proxy: { url: proxyUrl } });
const client = Deno.createHttpClient({});

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

async function main(args: Array<string>): Promise<void> {
  const result: Array<string> = [];

  let name = "叶山さゆり";
  if (args.length > 0) {
    name = args[0];
  }

  const iter = bangoGen(name);
  for await (const e of iter) {
    // console.log(e);
    result.push(e);
  }

  for (const e of result) {
    console.log(e);
  }
}

if (import.meta.main) {
  main(Deno.args);
}
