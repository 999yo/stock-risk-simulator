export const DECLINE_RATES = [0.05, 0.1, 0.15, 0.2, 0.3] as const;

export type SimulationInput = {
  price: number;
  quantity: number;
  averageCost: number;
  lossLimit: number;
};

export type Scenario = {
  rate: number;
  price: number;
  value: number;
  additionalLoss: number;
  profitLoss: number;
  profitLossRate: number;
  lossAmount: number;
  difference: number;
  exceeded: boolean;
};

export type SimulationResult = {
  acquisitionTotal: number;
  currentValue: number;
  profitLoss: number;
  profitLossRate: number;
  currentLoss: number;
  currentExceeded: boolean;
  thresholdPrice: number;
  thresholdDeclineRate: number;
  neverExceededAtZero: boolean;
  scenarios: Scenario[];
};

export function calculateSimulation(input: SimulationInput): SimulationResult {
  const { price, quantity, averageCost, lossLimit } = input;
  const acquisitionTotal = averageCost * quantity;
  const currentValue = price * quantity;
  const profitLoss = (price - averageCost) * quantity;
  const currentLoss = Math.max(0, -profitLoss);
  const rawThreshold = averageCost - lossLimit / quantity;
  const thresholdPrice = Math.max(0, rawThreshold);

  return {
    acquisitionTotal,
    currentValue,
    profitLoss,
    profitLossRate: ((price - averageCost) / averageCost) * 100,
    currentLoss,
    currentExceeded: currentLoss > lossLimit,
    thresholdPrice,
    thresholdDeclineRate: ((price - thresholdPrice) / price) * 100,
    neverExceededAtZero: rawThreshold < 0,
    scenarios: DECLINE_RATES.map((rate) => {
      const scenarioPrice = price * (1 - rate);
      const scenarioProfitLoss = (scenarioPrice - averageCost) * quantity;
      const lossAmount = Math.max(0, -scenarioProfitLoss);
      const difference = lossLimit - lossAmount;
      return {
        rate,
        price: scenarioPrice,
        value: scenarioPrice * quantity,
        additionalLoss: (price - scenarioPrice) * quantity,
        profitLoss: scenarioProfitLoss,
        profitLossRate: ((scenarioPrice - averageCost) / averageCost) * 100,
        lossAmount,
        difference,
        exceeded: difference < 0,
      };
    }),
  };
}

export function normalizeNumericInput(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[,\s￥¥円]/g, "");
}

export function normalizeTicker(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase();
}
