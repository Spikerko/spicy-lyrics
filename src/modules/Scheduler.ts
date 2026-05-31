const SchedulerEnums = {
  timeout: 0,
  interval: 1,
  raf: 2,
} as const;

export type ScheduledCallback = (...args: any[]) => void;
export type SchedulerValue =
  (typeof SchedulerEnums)[keyof typeof SchedulerEnums];
export type ScheduledDataObject = {
  cancelled: boolean;
};
export type Scheduled = [SchedulerValue, number, ScheduledDataObject];

const Timeout =
  (cb: ScheduledCallback, ms: number): Scheduled => [
    SchedulerEnums.timeout,
    window.setTimeout(cb, ms),
    { cancelled: false },
  ];

const Interval =
  (cb: ScheduledCallback, ms: number): Scheduled => [
    SchedulerEnums.interval,
    window.setInterval(cb, ms),
    { cancelled: false },
  ];

const OnPreRender =
  (cb: ScheduledCallback): Scheduled => [
    SchedulerEnums.raf,
    requestAnimationFrame(cb),
    { cancelled: false },
  ];

const Cancel = (scheduledItems: Scheduled | Array<Scheduled>) => {
  const normalizedItems = Array.isArray(scheduledItems[0])
    ? (scheduledItems as Array<Scheduled>)
    : [scheduledItems as Scheduled];

  for (const scheduledItem of normalizedItems) {
    const [type, id, dataObject] = scheduledItem;
    if (dataObject.cancelled) continue;
    dataObject.cancelled = true;

    if (type === SchedulerEnums.timeout) window.clearTimeout(id);
    else if (type === SchedulerEnums.interval) window.clearInterval(id);
    else if (type === SchedulerEnums.raf) cancelAnimationFrame(id);
  }
};

const IsScheduled = (value: unknown): value is Scheduled =>
  Array.isArray(value) &&
  value.length === 3 &&
  typeof value[0] === "number" &&
  typeof value[1] === "number" &&
  typeof value[2] === "object";

const Scheduler = {
  Timeout,
  Interval,
  OnPreRender,
  Cancel,
  IsScheduled,
};

export default Scheduler;
