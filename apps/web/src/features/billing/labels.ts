export const SUBSCRIPTION_COLOR: Record<string, string> = {
  none: 'gray',
  trial: 'blue',
  active: 'green',
  grace: 'orange',
  frozen: 'red',
  canceled: 'gray',
};

export const REWARD_LABEL = {
  accrued: 'начислено',
  paid: 'выплачено',
  on_hold: 'ждёт разморозки',
} as const;

export const REWARD_COLOR = { accrued: 'blue', paid: 'green', on_hold: 'orange' } as const;
