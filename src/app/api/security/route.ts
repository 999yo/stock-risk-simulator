import { NextResponse } from "next/server";

const EXCHANGE_CODES = {
  TSE: { openFigi: "JT", name: "東京証券取引所" },
  NSE: { openFigi: "JN", name: "名古屋証券取引所" },
  FSE: { openFigi: "JF", name: "福岡証券取引所" },
  SSE: { openFigi: "JS", name: "札幌証券取引所" },
} as const;

type Market = keyof typeof EXCHANGE_CODES;

type OpenFigiResult = {
  data?: Array<{
    name?: string;
    ticker?: string;
    exchCode?: string;
    securityType?: string;
    securityType2?: string;
    marketSector?: string;
  }>;
  error?: string;
  warning?: string;
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "リクエスト形式が正しくありません。" }, { status: 400 });
  }

  const { ticker, market } = (body ?? {}) as { ticker?: unknown; market?: unknown };
  if (typeof ticker !== "string" || !/^[0-9A-Z]{4}$/.test(ticker)) {
    return NextResponse.json(
      { message: "銘柄コードを半角英数字4文字で入力してください" },
      { status: 400 },
    );
  }
  if (typeof market !== "string" || !(market in EXCHANGE_CODES)) {
    return NextResponse.json({ message: "市場を選択してください" }, { status: 400 });
  }

  const exchange = EXCHANGE_CODES[market as Market];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (process.env.OPENFIGI_API_KEY) headers["X-OPENFIGI-APIKEY"] = process.env.OPENFIGI_API_KEY;

    const response = await fetch("https://api.openfigi.com/v3/mapping", {
      method: "POST",
      headers,
      body: JSON.stringify([
        {
          idType: "TICKER",
          idValue: ticker,
          exchCode: exchange.openFigi,
          marketSecDes: "Equity",
        },
      ]),
      signal: controller.signal,
      next: { revalidate: 300 },
    });

    if (response.status === 429) {
      return NextResponse.json(
        { message: "現在アクセスが集中しています。しばらくしてから再度お試しください。" },
        { status: 429 },
      );
    }
    if (!response.ok) throw new Error(`OpenFIGI responded ${response.status}`);

    const payload = (await response.json()) as OpenFigiResult[];
    const candidates = (payload[0]?.data ?? [])
      .filter(
        (item) =>
          item.exchCode === exchange.openFigi &&
          item.marketSector === "Equity" &&
          (item.securityType2 === "Common Stock" ||
            item.securityType?.toLowerCase().includes("common")),
      )
      .map((item) => item.name)
      .filter((name): name is string => Boolean(name))
      .filter((name, index, names) => names.indexOf(name) === index);

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          message:
            "該当する普通株式が見つかりませんでした。コードを確認するか、会社名を手入力してください。",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ticker,
      market,
      marketName: exchange.name,
      candidates,
      source: "OpenFIGI",
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { message: "銘柄情報を取得できませんでした。通信環境を確認して、もう一度お試しください。" },
      { status: 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
