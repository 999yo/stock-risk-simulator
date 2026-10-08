import { NextResponse } from "next/server";
import {
  getDelayedWindow,
  isLocalHostname,
  selectLatestDelayedClose,
  type JQuantsDailyBar,
} from "@/lib/jquants";

const unavailableMessage =
  "J-Quants連携は未設定です。株価を手入力して試算を続けてください。";

function isPrivateIntegrationAvailable(request: Request) {
  return (
    process.env.JQUANTS_PRIVATE_MODE === "true" &&
    Boolean(process.env.JQUANTS_API_KEY) &&
    isLocalHostname(new URL(request.url).hostname)
  );
}

export async function GET(request: Request) {
  return NextResponse.json({
    available: isPrivateIntegrationAvailable(request),
    mode: "private-local-only",
    delay: "約12週間",
  });
}

export async function POST(request: Request) {
  if (!isPrivateIntegrationAvailable(request)) {
    return NextResponse.json({ message: unavailableMessage }, { status: 503 });
  }

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
  if (market !== "TSE") {
    return NextResponse.json(
      {
        message:
          "J-Quantsの株価四本値は東証上場銘柄のみ対象です。株価を手入力してください。",
      },
      { status: 422 },
    );
  }

  const { from, to } = getDelayedWindow();
  const url = new URL("https://api.jquants.com/v2/equities/bars/daily");
  url.searchParams.set("code", ticker);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: { "x-api-key": process.env.JQUANTS_API_KEY! },
      signal: controller.signal,
      cache: "no-store",
    });

    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        {
          message:
            "J-Quantsの認証に失敗しました。APIキーと契約状態を確認し、株価は手入力してください。",
        },
        { status: 502 },
      );
    }
    if (response.status === 429) {
      return NextResponse.json(
        {
          message:
            "J-Quantsの利用上限に達しました。時間をおいて再試行するか、株価を手入力してください。",
        },
        { status: 429 },
      );
    }
    if (!response.ok) throw new Error(`J-Quants responded ${response.status}`);

    const payload = (await response.json()) as { data?: JQuantsDailyBar[] };
    const latest = selectLatestDelayedClose(payload.data ?? []);
    if (!latest) {
      return NextResponse.json(
        {
          message:
            "約12週間前までに利用できる終値が見つかりませんでした。株価を手入力してください。",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ticker,
      market,
      price: latest.close,
      priceDate: latest.date,
      adjusted: latest.adjusted,
      delay: "約12週間",
      source: "J-Quants API（個人・私的利用）",
    });
  } catch {
    return NextResponse.json(
      {
        message:
          "J-Quantsから遅延株価を取得できませんでした。株価を手入力して試算を続けてください。",
      },
      { status: 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
