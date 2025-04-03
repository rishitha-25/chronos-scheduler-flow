

export interface Job {
  id: string;
  name: string;
  arrivalTime: number;
  burstTime: number;
  startTime?: number;
  endTime?: number;
  turnaroundTime?: number;
  waitingTime?: number;
  remainingTime?: number;
}

export interface TimelineEvent {
  cpuId: number;
  jobId: string | null;
  jobName: string | null;
  startTime: number;
  endTime: number;
  isIdle: boolean;
}

export interface QueueState {
  time: number;
  jobs: {
    id: string;
    name: string;
    remainingTime: number;
  }[];
}

export interface SchedulingResult {
  completedJobs: Job[];
  timeline: TimelineEvent[];
  queueStates: QueueState[];
  maxTime: number;
  jobColors: Record<string, string>;
}

