
import { Job, SchedulingResult, TimelineEvent, QueueState } from "@/types/scheduler";

// Define colors for jobs
const jobColors = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#f97316", // orange
  "#84cc16", // lime
];

// Helper to assign colors to jobs
const assignJobColors = (jobs: Job[]): Record<string, string> => {
  const colorMap: Record<string, string> = {};
  jobs.forEach((job, index) => {
    colorMap[job.id] = jobColors[index % jobColors.length];
  });
  return colorMap;
};

export const scheduleSRTN = (
  inputJobs: Job[],
  numCPUs: number,
  quantum: number
): SchedulingResult => {
  // Create a deep copy of input jobs to avoid modifying the original
  const jobs = inputJobs.map(job => ({
    ...job,
    remainingTime: job.burstTime,
    startTime: undefined,
    endTime: undefined
  }));

  const completedJobs: Job[] = [];
  const timeline: TimelineEvent[] = [];
  const queueStates: QueueState[] = [];
  
  let currentTime = 0;
  let runningJobs = Array(numCPUs).fill(null);
  let jobEndTimes = Array(numCPUs).fill(0);
  let nextQuantumEndTimes = Array(numCPUs).fill(0);
  
  // Find the earliest arrival time to start processing
  const earliestArrival = Math.min(...jobs.map(job => job.arrivalTime));
  currentTime = earliestArrival;
  
  // Initialize quantum end times
  for (let i = 0; i < numCPUs; i++) {
    nextQuantumEndTimes[i] = currentTime + quantum;
  }

  // Main scheduling loop
  while (jobs.filter(job => job.remainingTime! > 0).length > 0 || runningJobs.some(job => job !== null)) {
    // Track which jobs are currently assigned to any CPU to prevent the same job running on multiple CPUs
    const assignedJobIds = runningJobs
      .filter(job => job !== null)
      .map(job => job!.id);

    // Add newly arrived jobs to the ready queue
    const readyQueue = jobs.filter(
      job => job.arrivalTime <= currentTime && 
             job.remainingTime! > 0 && 
             !assignedJobIds.includes(job.id) // Exclude jobs already running on any CPU
    );
    
    // Sort ready queue by remaining time (shortest first)
    readyQueue.sort((a, b) => a.remainingTime! - b.remainingTime!);
    
    // Update queue state
    queueStates.push({
      time: currentTime,
      jobs: readyQueue.map(job => ({
        id: job.id,
        name: job.name,
        remainingTime: job.remainingTime!
      }))
    });
    
    // Check each CPU for quantum end or job completion
    for (let i = 0; i < numCPUs; i++) {
      if (currentTime >= nextQuantumEndTimes[i]) {
        // If quantum ended, preempt the job if it's still running
        if (runningJobs[i] !== null) {
          const job = jobs.find(j => j.id === runningJobs[i]!.id);
          if (job && job.remainingTime! > 0) {
            // Job was preempted - it will go back to ready queue
            runningJobs[i] = null;
          }
        }
      }
    }
    
    // Assign jobs to available CPUs
    for (let i = 0; i < numCPUs; i++) {
      const isCPUAvailable = runningJobs[i] === null;

      if (isCPUAvailable && readyQueue.length > 0) {
        // Find the first job not already running on another CPU
        let nextJobIndex = 0;
        while (
          nextJobIndex < readyQueue.length && 
          assignedJobIds.includes(readyQueue[nextJobIndex].id)
        ) {
          nextJobIndex++;
        }

        // If we found an available job, schedule it
        if (nextJobIndex < readyQueue.length) {
          const nextJob = readyQueue.splice(nextJobIndex, 1)[0];
          
          // If this is the first time this job is running, set its start time
          if (nextJob.startTime === undefined) {
            nextJob.startTime = currentTime;
          }
          
          // Set next quantum end time for this CPU
          nextQuantumEndTimes[i] = currentTime + quantum;
          
          // Calculate when job will end - either at completion or at quantum end
          const jobCompletionTime = currentTime + nextJob.remainingTime!;
          const processingEndTime = Math.min(jobCompletionTime, nextQuantumEndTimes[i]);
          
          jobEndTimes[i] = processingEndTime;
          runningJobs[i] = { ...nextJob, endTimeForThisRun: processingEndTime };
          
          timeline.push({
            cpuId: i,
            jobId: nextJob.id,
            jobName: nextJob.name,
            startTime: currentTime,
            endTime: processingEndTime,
            isIdle: false
          });
        } else if (readyQueue.length === 0) {
          // If no unassigned jobs are available, CPU is idle until next event
          const nextJobArrival = Math.min(
            ...jobs
              .filter(job => job.arrivalTime > currentTime && job.remainingTime! > 0)
              .map(job => job.arrivalTime),
            Infinity
          );
          
          const nextCPUEvent = Math.min(
            ...jobEndTimes.filter(time => time > currentTime),
            Infinity
          );
          
          const nextTimePoint = Math.min(
            isFinite(nextJobArrival) ? nextJobArrival : Infinity,
            isFinite(nextCPUEvent) ? nextCPUEvent : Infinity
          );
          
          if (isFinite(nextTimePoint) && nextTimePoint > currentTime) {
            timeline.push({
              cpuId: i,
              jobId: null,
              jobName: null,
              startTime: currentTime,
              endTime: nextTimePoint,
              isIdle: true
            });
            jobEndTimes[i] = nextTimePoint;
          }
        }
      } else if (runningJobs[i] === null) {
        // CPU is idle, schedule next event
        const nextJobArrival = Math.min(
          ...jobs
            .filter(job => job.arrivalTime > currentTime && job.remainingTime! > 0)
            .map(job => job.arrivalTime),
          Infinity
        );
        
        const nextCPUEvent = Math.min(
          ...jobEndTimes.filter(time => time > currentTime),
          Infinity
        );
        
        const nextTimePoint = Math.min(
          isFinite(nextJobArrival) ? nextJobArrival : Infinity,
          isFinite(nextCPUEvent) ? nextCPUEvent : Infinity
        );
        
        if (isFinite(nextTimePoint) && nextTimePoint > currentTime) {
          timeline.push({
            cpuId: i,
            jobId: null,
            jobName: null,
            startTime: currentTime,
            endTime: nextTimePoint,
            isIdle: true
          });
          jobEndTimes[i] = nextTimePoint;
        }
      }
    }
    
    // Determine next event time
    const nextCompletionTime = Math.min(...jobEndTimes.filter(time => time > currentTime));
    
    // Update job remaining times based on work done until the next event
    for (let i = 0; i < numCPUs; i++) {
      const runningJob = runningJobs[i];
      if (runningJob !== null) {
        const job = jobs.find(j => j.id === runningJob.id)!;
        const timeProcessed = Math.min(nextCompletionTime - currentTime, job.remainingTime!);
        job.remainingTime! -= timeProcessed;
        
        // Check if job completed
        if (job.remainingTime! <= 0) {
          job.endTime = nextCompletionTime;
          job.turnaroundTime = job.endTime - job.arrivalTime;
          job.waitingTime = job.turnaroundTime - job.burstTime;
          
          completedJobs.push({ ...job });
          
          // Mark CPU as available immediately when job completes
          runningJobs[i] = null;
          nextQuantumEndTimes[i] = nextCompletionTime;
        }
        // If job reaches quantum end but isn't complete, it will be preempted
        else if (nextCompletionTime >= nextQuantumEndTimes[i]) {
          runningJobs[i] = null;
        }
      }
    }
    
    // Move time forward
    currentTime = nextCompletionTime;
  }
  
  // Sort completed jobs by name for consistent display
  completedJobs.sort((a, b) => a.name.localeCompare(b.name));
  
  return {
    completedJobs,
    timeline,
    queueStates,
    maxTime: Math.max(...timeline.map(event => event.endTime)),
    jobColors: assignJobColors(inputJobs)
  };
};

export const scheduleRoundRobin = (
  inputJobs: Job[],
  numCPUs: number,
  quantum: number
): SchedulingResult => {
  // Create a deep copy of input jobs to avoid modifying the original
  const jobs = inputJobs.map(job => ({
    ...job,
    remainingTime: job.burstTime,
    startTime: undefined,
    endTime: undefined
  }));

  const completedJobs: Job[] = [];
  const timeline: TimelineEvent[] = [];
  const queueStates: QueueState[] = [];
  
  let currentTime = 0;
  let runningJobs = Array(numCPUs).fill(null);
  let jobEndTimes = Array(numCPUs).fill(0);
  let readyQueue: Job[] = [];
  let nextQuantumEndTimes = Array(numCPUs).fill(0);
  
  // Find the earliest arrival time to start processing
  const earliestArrival = Math.min(...jobs.map(job => job.arrivalTime));
  currentTime = earliestArrival;
  
  // Initialize quantum start times
  for (let i = 0; i < numCPUs; i++) {
    nextQuantumEndTimes[i] = currentTime + quantum;
  }
  
  // Main scheduling loop
  while (jobs.filter(job => job.remainingTime! > 0).length > 0 || 
         runningJobs.some(job => job !== null) || 
         readyQueue.length > 0) {
    
    // Track which jobs are currently assigned to CPUs
    const assignedJobIds = runningJobs
      .filter(job => job !== null)
      .map(job => job!.id);
    
    // 1. Add newly arrived jobs to the ready queue
    const newArrivals = jobs.filter(
      job => job.arrivalTime <= currentTime && 
             job.remainingTime! > 0 && 
             !readyQueue.some(queuedJob => queuedJob.id === job.id) && 
             !assignedJobIds.includes(job.id)
    );
    
    readyQueue.push(...newArrivals);
    
    // 2. Check if any CPUs have reached the end of their quantum
    for (let i = 0; i < numCPUs; i++) {
      if (currentTime >= nextQuantumEndTimes[i]) {
        // If quantum ended, preempt the job if it's still running
        if (runningJobs[i] !== null) {
          const job = jobs.find(j => j.id === runningJobs[i]!.id);
          if (job && job.remainingTime! > 0) {
            // Put job back in the queue if it still has remaining time
            readyQueue.push({ ...job });
          }
          // Clear the running job
          runningJobs[i] = null;
        }
      }
    }
    
    // 3. Update queue state
    queueStates.push({
      time: currentTime,
      jobs: readyQueue.map(job => ({
        id: job.id,
        name: job.name,
        remainingTime: job.remainingTime!
      }))
    });
    
    // 4. Assign jobs to available CPUs
    for (let i = 0; i < numCPUs; i++) {
      const isCPUAvailable = runningJobs[i] === null;
      
      if (isCPUAvailable && readyQueue.length > 0) {
        // Find a job that's not currently running on another CPU
        let nextJobIndex = 0;
        while (
          nextJobIndex < readyQueue.length && 
          assignedJobIds.includes(readyQueue[nextJobIndex].id)
        ) {
          nextJobIndex++;
        }

        // If we found an available job, assign it
        if (nextJobIndex < readyQueue.length) {
          const nextJob = readyQueue.splice(nextJobIndex, 1)[0];
          
          // If this is the first time this job is running, set its start time
          if (nextJob.startTime === undefined) {
            nextJob.startTime = currentTime;
          }
          
          // Set next quantum end time for this CPU
          nextQuantumEndTimes[i] = currentTime + quantum;
          
          // Calculate when job will end - either at completion or at quantum end
          const jobCompletionTime = currentTime + nextJob.remainingTime!;
          const processingEndTime = Math.min(jobCompletionTime, nextQuantumEndTimes[i]);
          
          jobEndTimes[i] = processingEndTime;
          runningJobs[i] = { ...nextJob, endTimeForThisRun: processingEndTime };
          
          timeline.push({
            cpuId: i,
            jobId: nextJob.id,
            jobName: nextJob.name,
            startTime: currentTime,
            endTime: processingEndTime,
            isIdle: false
          });
        } else if (readyQueue.length === 0) {
          // CPU is idle - schedule next time point
          const nextJobArrival = Math.min(
            ...jobs
              .filter(job => job.arrivalTime > currentTime && job.remainingTime! > 0)
              .map(job => job.arrivalTime),
            Infinity
          );
          
          const nextCPUEvent = Math.min(
            ...jobEndTimes.filter(time => time > currentTime),
            Infinity
          );
          
          const nextTimePoint = Math.min(
            isFinite(nextJobArrival) ? nextJobArrival : Infinity,
            isFinite(nextCPUEvent) ? nextCPUEvent : Infinity
          );
          
          if (isFinite(nextTimePoint) && nextTimePoint > currentTime) {
            timeline.push({
              cpuId: i,
              jobId: null,
              jobName: null,
              startTime: currentTime,
              endTime: nextTimePoint,
              isIdle: true
            });
            jobEndTimes[i] = nextTimePoint;
          }
        }
      } else if (runningJobs[i] === null) {
        // CPU is idle - schedule next time point
        const nextJobArrival = Math.min(
          ...jobs
            .filter(job => job.arrivalTime > currentTime && job.remainingTime! > 0)
            .map(job => job.arrivalTime),
          Infinity
        );
        
        const nextCPUEvent = Math.min(
          ...jobEndTimes.filter(time => time > currentTime),
          Infinity
        );
        
        const nextTimePoint = Math.min(
          isFinite(nextJobArrival) ? nextJobArrival : Infinity,
          isFinite(nextCPUEvent) ? nextCPUEvent : Infinity
        );
        
        if (isFinite(nextTimePoint) && nextTimePoint > currentTime) {
          timeline.push({
            cpuId: i,
            jobId: null,
            jobName: null,
            startTime: currentTime,
            endTime: nextTimePoint,
            isIdle: true
          });
          jobEndTimes[i] = nextTimePoint;
        }
      }
    }
    
    // 5. Determine next event time
    const nextEventTime = Math.min(
      ...jobEndTimes.filter(time => time > currentTime)
    );
    
    // 6. Update job remaining times and handle completed jobs
    for (let i = 0; i < numCPUs; i++) {
      if (runningJobs[i] !== null) {
        const runningJob = runningJobs[i]!;
        const job = jobs.find(j => j.id === runningJob.id)!;
        
        const timeProcessed = Math.min(nextEventTime - currentTime, job.remainingTime!);
        job.remainingTime! -= timeProcessed;
        
        // If job is finished
        if (job.remainingTime! <= 0) {
          job.endTime = currentTime + timeProcessed;
          job.turnaroundTime = job.endTime - job.arrivalTime;
          job.waitingTime = job.turnaroundTime - job.burstTime;
          
          completedJobs.push({ ...job });
          
          // Mark CPU as available immediately when job completes
          runningJobs[i] = null;
          nextQuantumEndTimes[i] = job.endTime;
        }
        // If job reaches quantum end but isn't complete, it will be preempted in the next iteration
      }
    }
    
    // Move time forward
    currentTime = nextEventTime;
  }
  
  // Sort completed jobs by name for consistent display
  completedJobs.sort((a, b) => a.name.localeCompare(b.name));
  
  return {
    completedJobs,
    timeline,
    queueStates,
    maxTime: Math.max(...timeline.map(event => event.endTime)),
    jobColors: assignJobColors(inputJobs)
  };
};
