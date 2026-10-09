"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateSimulation, normalizeNumericInput, normalizeTicker } from "@/lib/simulation";

type Market = "TSE" | "NSE" | "FSE" | "SSE";
type PriceKind = "manual" | "delayed";
type FormValues = {
  ticker: string;
  market: Market | "";
  companyName: string;
  price: string;
  date: string;
  quantity: string;
  averageCost: string;
  lossLimit: string;
};
type ResultMeta = {
  price: string;
  date: string;
  lossLimit: string;
  priceKind: PriceKind;
};
type Errors = Partial<Record<keyof FormValues, string>>;
type SecurityState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; candidates: string[]; marketName: string; fetchedAt: string }
  | { status: "error"; message: string; canRetry: boolean };
type JQuantsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; price: number; date: string; adjusted: boolean }
  | { status: "error"; message: string };

const marketNames: Record<Market, string> = {
  TSE: "東京",
  NSE: "名古屋",
  FSE: "福岡",
  SSE: "札幌",
};

const TODAY_START = new Date(new Date().toISOString().slice(0, 10)).getTime();

const initialValues: FormValues = {
  ticker: "",
  market: "",
  companyName: "",
  price: "",
  date: "",
  quantity: "",
  averageCost: "",
  lossLimit: "",
};

const yen = (value: number) => `${Math.round(value).toLocaleString("ja-JP")}円`;
const signedYen = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(Math.round(value)).toLocaleString("ja-JP")}円`;
const percent = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}%`;
const formatDate = (iso: string) => {
  const [year, month, day] = iso.split("-");
  return year && month && day ? `${year}/${month}/${day}` : iso;
};

function Field({
  id,
  label,
  value,
  onChange,
  error,
  help,
  type = "text",
  suffix,
  maxLength,
}: {
  id: keyof FormValues;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  help?: string;
  type?: "text" | "date";
  suffix?: string;
  maxLength?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={type}
          value={value}
          maxLength={maxLength}
          inputMode={type === "date" ? undefined : suffix ? "numeric" : "text"}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-help ${id}-error`}
          className={suffix ? "pr-12" : ""}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">
            {suffix}
          </span>
        )}
      </div>
      {help && (
        <p id={`${id}-help`} className="text-xs leading-relaxed text-slate-500">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-1 text-sm text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export function StockSimulator() {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Errors>({});
  const [security, setSecurity] = useState<SecurityState>({ status: "idle" });
  const [jquants, setJquants] = useState<JQuantsState>({ status: "idle" });
  const [priceKind, setPriceKind] = useState<PriceKind>("manual");
  const [integration, setIntegration] = useState<"unknown" | "ready" | "unconfigured">("unknown");
  const [result, setResult] = useState<ReturnType<typeof calculateSimulation> | null>(null);
  const [resultMeta, setResultMeta] = useState<ResultMeta | null>(null);
  const [dirty, setDirty] = useState(false);
  const liveRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/jquants", { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as { available?: boolean };
        setIntegration(payload.available ? "ready" : "unconfigured");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setIntegration("unknown");
      });
    return () => controller.abort();
  }, []);

  const setValue = (field: keyof FormValues, value: string, affectsSecurity = false) => {
    const normalized =
      field === "ticker"
        ? normalizeTicker(value)
        : ["price", "quantity", "averageCost", "lossLimit"].includes(field)
          ? normalizeNumericInput(value)
          : value;
    setValues((current) => ({ ...current, [field]: normalized }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (field === "price") setPriceKind("manual");
    if (result) setDirty(true);
    if (affectsSecurity) {
      setPriceKind("manual");
      setSecurity({ status: "idle" });
      setJquants({ status: "idle" });
      setResult(null);
      setResultMeta(null);
      setDirty(false);
      setValues((current) => ({ ...current, [field]: normalized, companyName: "" }));
    }
  };

  const fetchDelayedPrice = async () => {
    if (!validateSecurity()) return;
    if (values.market !== "TSE") {
      setJquants({
        status: "error",
        message: "J-Quantsの株価四本値は東証上場銘柄のみ対象です。株価を手入力してください。",
      });
      return;
    }

    setJquants({ status: "loading" });
    try {
      const response = await fetch("/api/jquants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: values.ticker, market: values.market }),
      });
      const payload = (await response.json()) as {
        message?: string;
        price?: number;
        priceDate?: string;
        adjusted?: boolean;
      };
      if (
        !response.ok ||
        typeof payload.price !== "number" ||
        typeof payload.priceDate !== "string"
      ) {
        setJquants({
          status: "error",
          message:
            payload.message ??
            "約12週間遅延の終値を取得できませんでした。株価を手入力して試算を続けてください。",
        });
        return;
      }
      const delayedPrice = Math.round(payload.price);
      const delayedDate = payload.priceDate;

      setPriceKind("delayed");
      setValues((current) => ({
        ...current,
        price: String(delayedPrice),
        date: delayedDate,
      }));
      if (result) setDirty(true);
      setErrors((current) => ({
        ...current,
        price: undefined,
        date: undefined,
      }));
      setJquants({
        status: "success",
        price: delayedPrice,
        date: delayedDate,
        adjusted: Boolean(payload.adjusted),
      });
    } catch {
      setJquants({
        status: "error",
        message:
          "J-Quantsから約12週間遅延の終値を取得できませんでした。株価を手入力して試算を続けてください。",
      });
    }
  };

  const validateSecurity = () => {
    const next: Errors = {};
    if (!/^[0-9A-Z]{4}$/.test(values.ticker))
      next.ticker = "銘柄コードを半角英数字4文字で入力してください";
    if (!values.market) next.market = "市場を選択してください";
    setErrors((current) => ({ ...current, ...next }));
    return Object.keys(next).length === 0;
  };

  const fetchSecurity = async () => {
    if (!validateSecurity()) return;
    setSecurity({ status: "loading" });
    try {
      const response = await fetch("/api/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: values.ticker, market: values.market }),
      });
      const payload = (await response.json()) as {
        message?: string;
        candidates?: string[];
        marketName?: string;
        fetchedAt?: string;
      };
      if (!response.ok) {
        setSecurity({
          status: "error",
          message: payload.message ?? "銘柄情報を取得できませんでした。",
          canRetry: response.status !== 429,
        });
        return;
      }
      setSecurity({
        status: "success",
        candidates: payload.candidates ?? [],
        marketName: payload.marketName ?? marketNames[values.market as Market],
        fetchedAt: payload.fetchedAt ?? new Date().toISOString(),
      });
      setValues((current) => ({ ...current, companyName: payload.candidates?.[0] ?? "" }));
    } catch {
      setSecurity({
        status: "error",
        message: "銘柄情報を取得できませんでした。通信環境を確認して、もう一度お試しください。",
        canRetry: true,
      });
    }
  };

  const validateForm = () => {
    const next: Errors = {};
    const checkInteger = (
      field: "price" | "quantity" | "averageCost" | "lossLimit",
      min: number,
      max: number,
      message: string,
    ) => {
      const value = Number(values[field]);
      if (!values[field] || !Number.isInteger(value) || value < min || value > max) next[field] = message;
    };
    if (!/^[0-9A-Z]{4}$/.test(values.ticker))
      next.ticker = "銘柄コードを半角英数字4文字で入力してください";
    if (!values.market) next.market = "市場を選択してください";
    if (values.companyName.length > 100) next.companyName = "会社名は100文字以内で入力してください";
    checkInteger("price", 1, 10_000_000, "株価を1円から10,000,000円までの整数で入力してください");
    checkInteger("quantity", 1, 1_000_000, "保有株数を1株から1,000,000株までの整数で入力してください");
    checkInteger(
      "averageCost",
      1,
      10_000_000,
      "平均取得単価を1円から10,000,000円までの整数で入力してください",
    );
    checkInteger(
      "lossLimit",
      0,
      10_000_000_000_000,
      "最大損失許容額を0円から10,000,000,000,000円までの整数で入力してください",
    );
    if (!values.date || values.date > new Date().toISOString().slice(0, 10))
      next.date = "価格基準日を入力してください";
    setErrors(next);
    return next;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validateForm();
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      requestAnimationFrame(() => document.getElementById(firstError)?.focus());
      return;
    }
    setResult(
      calculateSimulation({
        price: Number(values.price),
        quantity: Number(values.quantity),
        averageCost: Number(values.averageCost),
        lossLimit: Number(values.lossLimit),
      }),
    );
    setResultMeta({
      price: values.price,
      date: values.date,
      lossLimit: values.lossLimit,
      priceKind,
    });
    setDirty(false);
    requestAnimationFrame(() => document.getElementById("results")?.focus());
  };

  const isStaleDate = useMemo(() => {
    if (priceKind !== "manual" || !values.date) return false;
    return TODAY_START - new Date(`${values.date}T00:00:00`).getTime() >= 4 * 86_400_000;
  }, [priceKind, values.date]);

  const clear = () => {
    setValues(initialValues);
    setErrors({});
    setSecurity({ status: "idle" });
    setJquants({ status: "idle" });
    setPriceKind("manual");
    setResult(null);
    setResultMeta(null);
    setDirty(false);
  };

  const graphData = result
    ? [
        { label: "株価", price: Number(resultMeta?.price), profitLoss: result.profitLoss },
        ...result.scenarios.map((item) => ({
          label: `-${item.rate * 100}%`,
          price: item.price,
          profitLoss: item.profitLoss,
        })),
      ]
    : [];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 border-b border-slate-200 pb-7">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-teal-700">
          <CircleDollarSign className="size-5" aria-hidden />
          STOCK RISK LAB
        </div>
        <h1 className="text-balance text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
          日本株 損益・リスクシミュレーター
        </h1>
        <p className="mt-3 text-lg font-medium text-slate-700">買う前に、負け方を可視化する。</p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          手入力した株価、または約12週間遅延の終値で、損益と下落時の損失を試算します。
        </p>
      </header>

      <p ref={liveRef} className="sr-only" role="status" aria-live="polite">
        {jquants.status === "loading"
          ? "約12週間遅延の終値を反映しています"
          : security.status === "loading"
            ? "銘柄名を取得しています"
            : dirty && result
              ? "入力内容が変更されています。再度試算してください。"
              : result
                ? "リスクシミュレーションが完了しました"
                : jquants.status === "error"
                  ? jquants.message
                  : jquants.status === "success"
                    ? "約12週間遅延の終値を反映しました"
                    : integration === "unconfigured"
                      ? "J-Quants連携は未設定です。株価を手入力して試算を続けてください。"
                      : ""}
      </p>

      <form onSubmit={submit} noValidate>
        <Card className="mb-6 overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-slate-50/80">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">
                1
              </span>
              <div>
                <CardTitle>銘柄を指定</CardTitle>
                <CardDescription>4文字の銘柄コードと上場市場を指定します</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid gap-5 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
              <Field
                id="ticker"
                label="銘柄コード"
                value={values.ticker}
                onChange={(value) => setValue("ticker", value, true)}
                error={errors.ticker}
                help="半角英数字4文字（全角は自動変換）"
                maxLength={4}
              />
              <div className="space-y-2">
                <Label htmlFor="market">市場識別子</Label>
                <select
                  id="market"
                  value={values.market}
                  aria-invalid={Boolean(errors.market)}
                  onChange={(event) => setValue("market", event.target.value, true)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="">市場を選択</option>
                  {Object.entries(marketNames).map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}（{code}）
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">上場市場を選択してください</p>
                {errors.market && (
                  <p role="alert" className="flex gap-1 text-sm text-red-700">
                    <AlertCircle className="size-4" aria-hidden />
                    {errors.market}
                  </p>
                )}
              </div>
              <Button
                type="button"
                className="mt-6 min-h-11 bg-teal-700 hover:bg-teal-800 sm:min-w-36"
                disabled={security.status === "loading"}
                onClick={fetchSecurity}
              >
                {security.status === "loading" ? (
                  <>
                    <LoaderCircle className="animate-spin" aria-hidden /> 取得中…
                  </>
                ) : (
                  "銘柄名を取得"
                )}
              </Button>
            </div>

            {security.status === "success" && (
              <div className="mt-6 rounded-xl border border-teal-200 bg-teal-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2 className="size-5 text-teal-700" aria-hidden />
                  <span className="font-semibold">{values.companyName || "名称未取得"}</span>
                  <Badge variant="outline">{security.marketName}</Badge>
                </div>
                {security.candidates.length > 1 && (
                  <div className="mt-3">
                    <Label htmlFor="candidate">名称候補</Label>
                    <select
                      id="candidate"
                      className="mt-1 h-9 w-full rounded-md border bg-white px-3 text-sm sm:max-w-md"
                      value={values.companyName}
                      onChange={(event) => setValue("companyName", event.target.value)}
                    >
                      {security.candidates.map((candidate) => (
                        <option key={candidate}>{candidate}</option>
                      ))}
                    </select>
                  </div>
                )}
                <p className="mt-2 text-xs text-slate-600">
                  名称提供: OpenFIGI（無保証）・取得日時:{" "}
                  {new Date(security.fetchedAt).toLocaleString("ja-JP")}
                </p>
              </div>
            )}

            {security.status === "error" && (
              <Alert variant="destructive" className="mt-6">
                <AlertCircle aria-hidden />
                <AlertTitle>銘柄名を取得できませんでした</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{security.message}</p>
                  {security.canRetry && (
                    <Button type="button" size="sm" variant="outline" onClick={fetchSecurity}>
                      <RefreshCw aria-hidden /> 再試行
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {(security.status === "error" || security.status === "idle") && (
              <div className="mt-5 max-w-xl">
                <Field
                  id="companyName"
                  label="会社名（任意・手入力）"
                  value={values.companyName}
                  onChange={(value) => setValue("companyName", value)}
                  error={errors.companyName}
                  help="取得できない場合は、空欄（名称未取得）のままでも試算できます"
                  maxLength={101}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">
                  2
                </span>
                <div>
                  <CardTitle>保有情報</CardTitle>
                  <CardDescription>保有株数と株価から損益を試算します</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 sm:col-span-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">約12週間遅延の終値</p>
                      <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100">個人利用</Badge>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">
                      個人利用のデプロイ先では、サーバーがJ-Quants無料版の約12週間遅延終値を取得し、株価と価格基準日へ反映します。現在値でも12時間遅延の価格でもありません。反映後も上書きできます。未設定または取得失敗時は、手入力のまま試算できます。
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 shrink-0 border-sky-300 bg-white"
                    disabled={jquants.status === "loading"}
                    onClick={fetchDelayedPrice}
                  >
                    {jquants.status === "loading" ? (
                      <>
                        <LoaderCircle className="animate-spin" aria-hidden /> 反映中…
                      </>
                    ) : (
                      "約12週間遅延の終値を反映"
                    )}
                  </Button>
                </div>
                {jquants.status === "success" && (
                  <Alert className="mt-4 border-teal-200 bg-white">
                    <CheckCircle2 className="text-teal-700" aria-hidden />
                    <AlertTitle>約12週間遅延の終値を反映しました</AlertTitle>
                    <AlertDescription>
                      価格基準日 {formatDate(jquants.date)}・{yen(jquants.price)}
                      {jquants.adjusted ? "（調整済み終値を1円単位へ四捨五入）" : ""}
                    </AlertDescription>
                  </Alert>
                )}
                {jquants.status === "error" && (
                  <Alert variant="destructive" className="mt-4 bg-white">
                    <AlertCircle aria-hidden />
                    <AlertTitle>終値を反映できませんでした</AlertTitle>
                    <AlertDescription>{jquants.message}</AlertDescription>
                  </Alert>
                )}
                {integration === "unconfigured" && jquants.status === "idle" && (
                  <Alert className="mt-4 border-slate-200 bg-white">
                    <AlertCircle aria-hidden />
                    <AlertTitle>J-Quants連携は未設定です</AlertTitle>
                    <AlertDescription>株価を手入力して試算を続けてください。</AlertDescription>
                  </Alert>
                )}
              </div>
              <Field
                id="price"
                label="株価"
                value={values.price}
                onChange={(value) => setValue("price", value)}
                error={errors.price}
                suffix="円"
                help="手入力するか、約12週間前の終値を反映できます"
              />
              <Field
                id="date"
                label="価格基準日"
                type="date"
                value={values.date}
                onChange={(value) => setValue("date", value)}
                error={errors.date}
                help="手入力した価格の日付、または取得した終値の日付"
              />
              <Field
                id="quantity"
                label="保有株数"
                value={values.quantity}
                onChange={(value) => setValue("quantity", value)}
                error={errors.quantity}
                suffix="株"
              />
              <Field
                id="averageCost"
                label="平均取得単価"
                value={values.averageCost}
                onChange={(value) => setValue("averageCost", value)}
                error={errors.averageCost}
                suffix="円"
                help="分割・併合調整済みの単価"
              />
              <div className="sm:col-span-2">
                <Field
                  id="lossLimit"
                  label="最大損失許容額"
                  value={values.lossLimit}
                  onChange={(value) => setValue("lossLimit", value)}
                  error={errors.lossLimit}
                  suffix="円"
                  help="取得総額に対して許容できる評価損の上限額"
                />
              </div>
              {isStaleDate && (
                <Alert className="border-amber-300 bg-amber-50 sm:col-span-2">
                  <AlertCircle className="text-amber-700" aria-hidden />
                  <AlertTitle>入力した価格の基準日をご確認ください</AlertTitle>
                  <AlertDescription>
                    このアプリは価格の新しさを保証しません。4暦日以上前の日付です。休場日を考慮した鮮度保証ではありません。
                  </AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="min-h-12 bg-teal-700 hover:bg-teal-800 sm:col-span-2">
                <TrendingDown aria-hidden /> リスクをシミュレーション
              </Button>
              <Dialog>
                <DialogTrigger
                  render={<Button type="button" variant="ghost" className="sm:col-span-2" />}
                >
                  入力をクリア
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>入力内容をクリアしますか？</DialogTitle>
                    <DialogDescription>入力した銘柄・価格・保有情報と試算結果を削除します。</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>キャンセル</DialogClose>
                    <DialogClose render={<Button variant="destructive" onClick={clear} />}>
                      クリアする
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-slate-950 text-white shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>この株価での損益</CardTitle>
                {result && resultMeta && (
                  <Badge className="bg-teal-400 text-slate-950">
                    {resultMeta.priceKind === "delayed" ? "約12週間遅延の終値" : "利用者入力"}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-slate-400">
                {result && resultMeta
                  ? resultMeta.priceKind === "delayed"
                    ? `約12週間遅延の終値。価格基準日: ${formatDate(resultMeta.date)}`
                    : `この価格は利用者が入力した値です。価格基準日: ${formatDate(resultMeta.date)}`
                  : "試算すると、この株価での損益を表示します"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!result ? (
                <div className="flex min-h-64 flex-col items-center justify-center text-center text-slate-400">
                  <TrendingDown className="mb-4 size-10" aria-hidden />
                  <p>必要な情報を入力して試算してください</p>
                </div>
              ) : (
                <dl className="grid gap-5 sm:grid-cols-2">
                  <Metric label="取得総額" value={yen(result.acquisitionTotal)} />
                  <Metric label="評価額" value={yen(result.currentValue)} />
                  <Metric
                    label="評価損益"
                    value={signedYen(result.profitLoss)}
                    tone={result.profitLoss >= 0 ? "positive" : "negative"}
                  />
                  <Metric
                    label="損益率"
                    value={percent(result.profitLossRate)}
                    tone={result.profitLoss >= 0 ? "positive" : "negative"}
                  />
                </dl>
              )}
            </CardContent>
          </Card>
        </div>
      </form>

      {result && resultMeta && (
        <section
          id="results"
          tabIndex={-1}
          aria-label="シミュレーション結果"
          className={`mt-8 space-y-6 outline-none transition-opacity ${dirty ? "opacity-60" : ""}`}
        >
          {dirty && (
            <Alert className="border-amber-300 bg-amber-50">
              <AlertCircle className="text-amber-700" aria-hidden />
              <AlertTitle>入力内容が変更されています</AlertTitle>
              <AlertDescription>再度試算してください。</AlertDescription>
            </Alert>
          )}

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>損益シミュレーション</CardTitle>
              <CardDescription>この株価から下落した場合の、取得時点からの想定損益です</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full" role="img" aria-label="下落後株価と想定損益の折れ線グラフ">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={graphData} margin={{ top: 10, right: 12, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis
                      width={70}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => `${Math.round(value / 1000)}千`}
                    />
                    <Tooltip
                      formatter={(value) => [signedYen(Number(value)), "想定損益"]}
                      labelFormatter={(label, payload) =>
                        `${label}・株価 ${yen(Number(payload[0]?.payload?.price ?? 0))}`
                      }
                    />
                    <ReferenceLine y={0} stroke="#64748b" />
                    <ReferenceLine
                      y={-Number(resultMeta.lossLimit)}
                      stroke="#dc2626"
                      strokeDasharray="5 4"
                      label={{ value: "許容額", fill: "#991b1b", fontSize: 11 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="profitLoss"
                      stroke="#0f766e"
                      strokeWidth={3}
                      dot={{ r: 4, fill: "#0f766e" }}
                      activeDot={{ r: 7 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>最大損失許容額との比較</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div
                className={`rounded-xl border p-5 ${
                  result.currentExceeded ? "border-red-200 bg-red-50" : "border-teal-200 bg-teal-50"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {result.currentExceeded ? (
                    <ShieldAlert className="text-red-700" aria-hidden />
                  ) : (
                    <CheckCircle2 className="text-teal-700" aria-hidden />
                  )}
                  {result.currentExceeded ? "入力した株価ですでに超過" : "この株価は許容額以内"}
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  {result.currentExceeded
                    ? `許容額を ${yen(result.currentLoss - Number(resultMeta.lossLimit))} 超過しています`
                    : `許容額まで残り ${yen(Number(resultMeta.lossLimit) - result.currentLoss)}`}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm text-slate-600">許容額に達する株価</p>
                <p className="mt-1 font-mono text-2xl font-bold">{yen(result.thresholdPrice)}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {result.neverExceededAtZero
                    ? "株価が0円になっても許容額を超えません"
                    : result.currentExceeded
                      ? "入力した株価ですでに最大損失許容額を超えています"
                      : `この株価から ${Math.max(0, result.thresholdDeclineRate).toFixed(2)}% 下落で到達`}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>下落率別シミュレーション</CardTitle>
              <CardDescription>計算途中では丸めず、表示時にのみ丸めています</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="hidden overflow-hidden rounded-lg border md:block">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-left text-xs text-slate-600">
                    <tr>
                      {["下落率", "下落後株価", "下落後評価額", "追加損失", "想定損益", "損益率", "判定"].map(
                        (heading) => (
                          <th key={heading} scope="col" className="px-3 py-3 font-semibold">
                            {heading}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {result.scenarios.map((scenario) => (
                      <tr key={scenario.rate} className="border-t">
                        <th scope="row" className="px-3 py-4 font-semibold">
                          −{scenario.rate * 100}%
                        </th>
                        <td className="px-3 py-4 font-mono">{yen(scenario.price)}</td>
                        <td className="px-3 py-4 font-mono">{yen(scenario.value)}</td>
                        <td className="px-3 py-4 font-mono">{yen(scenario.additionalLoss)}</td>
                        <td className="px-3 py-4 font-mono">{signedYen(scenario.profitLoss)}</td>
                        <td className="px-3 py-4 font-mono">{percent(scenario.profitLossRate)}</td>
                        <td className="px-3 py-4">
                          <StatusBadge exceeded={scenario.exceeded} difference={scenario.difference} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-4 md:hidden">
                {result.scenarios.map((scenario) => (
                  <article key={scenario.rate} className="rounded-xl border p-4">
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <h3 className="text-lg font-bold">{scenario.rate * 100}%下落</h3>
                      <StatusBadge exceeded={scenario.exceeded} difference={scenario.difference} />
                    </div>
                    <dl className="grid gap-3 text-sm">
                      <Row label="下落後株価" value={yen(scenario.price)} />
                      <Row label="下落後評価額" value={yen(scenario.value)} />
                      <Row label="この株価からの追加損失" value={yen(scenario.additionalLoss)} />
                      <Row label="取得時からの想定損益" value={signedYen(scenario.profitLoss)} />
                      <Row label="取得時からの想定損益率" value={percent(scenario.profitLossRate)} />
                    </dl>
                  </article>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      <section className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600 sm:p-7">
        <h2 className="mb-3 font-semibold text-slate-900">注意事項・免責事項</h2>
        <p>
          株価は、利用者が手入力した価格、または個人利用のデプロイ先でサーバーが取得したJ-Quants無料版の約12週間遅延の終値です。約12週間遅延の終値は、現在値でも12時間遅延の価格でもありません。価格の正確性・最新性を保証しません。計算結果は参考情報であり、投資成果を保証するものでも、特定の金融商品の売買を推奨するものでもありません。実際の損益には手数料、税金、価格変動、約定価格等が影響します。
        </p>
        <p className="mt-3">
          株式分割・併合等がある場合は、利用者自身で調整済みの平均取得単価を確認して入力してください。本サービスは取得単価を自動調整しません。入力内容は保存されません。
        </p>
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="border-b border-slate-800 pb-4">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd
        className={`mt-1 break-all font-mono text-2xl font-bold ${
          tone === "positive" ? "text-teal-300" : tone === "negative" ? "text-rose-300" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b pb-2 last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-all text-right font-mono font-semibold">{value}</dd>
    </div>
  );
}

function StatusBadge({ exceeded, difference }: { exceeded: boolean; difference: number }) {
  return (
    <div className="space-y-1">
      <Badge
        className={
          exceeded
            ? "bg-red-100 text-red-800 hover:bg-red-100"
            : "bg-teal-100 text-teal-800 hover:bg-teal-100"
        }
      >
        {exceeded ? <ShieldAlert aria-hidden /> : <CheckCircle2 aria-hidden />}
        {exceeded ? "許容額超過" : "許容額以内"}
      </Badge>
      <p className="text-xs text-slate-500">
        {exceeded ? `${yen(Math.abs(difference))}超過` : `残り${yen(difference)}`}
      </p>
    </div>
  );
}
