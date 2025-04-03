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
    
    // Track which CPUs had which jobs (to maintain continuity when possible)
    const lastJobByCP: Record<number, string | null> = {};
    for (let i = 0; i < numCPUs; i++) {
      lastJobByCP[i] = runningJobs[i] ? runningJobs[i]!.id : null;
    }
    
    // Assign jobs to available CPUs
    for (let i = 0; i < numCPUs; i++) {
      const isCPUAvailable = runningJobs[i] === null;

      if (isCPUAvailable && readyQueue.length > 0) {
        // Check if any jobs in the ready queue were last on this CPU
        const continuityJobIndex = readyQueue.findIndex(job => job.id === lastJobByCP[i]);
        // If a job was previously on this CPU and is in the ready queue, prioritize it
        let nextJobIndex = continuityJobIndex !== -1 ? continuityJobIndex : 0;
        
        // Find the first job not already running on another CPU
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
  
  // Add debug information to understand timeline data
  console.log("SRTN Timeline data:", { 
    timelineLength: timeline.length,
    maxTime: Math.max(...timeline.map(event => event.endTime))
  });
  
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
  
  // Find the earliest arrival time to start processing
  const earliestArrival = Math.min(...jobs.map(job => job.arrivalTime));
  let currentTime = earliestArrival;
  
  // Keep track of running jobs and their end times
  let runningJobs = Array(numCPUs).fill(null);
  let jobEndTimes = Array(numCPUs).fill(0);
  
  // A circular queue to maintain the round robin order
  // Initially, the queue will only contain jobs that have arrived
  let readyQueue: Job[] = [];
  
  // Track which CPU last executed each job (for continuity)
  const lastCPUForJob: Record<string, number> = {};
  
  // Main scheduling loop
  while (jobs.filter(job => job.remainingTime! > 0).length > 0 || readyQueue.length > 0 || runningJobs.some(job => job !== null)) {
    // Step 1: Add newly arrived jobs to the ready queue
    const newArrivals = jobs.filter(
      job => job.arrivalTime <= currentTime && 
             job.remainingTime! > 0 && 
             !readyQueue.some(queuedJob => queuedJob.id === job.id) &&
             !runningJobs.some(runningJob => runningJob && runningJob.id === job.id)
    );
    
    readyQueue = [...readyQueue, ...newArrivals];
    
    // Step 2: Record the current queue state
    queueStates.push({
      time: currentTime,
      jobs: readyQueue.map(job => ({
        id: job.id,
        name: job.name,
        remainingTime: job.remainingTime!
      }))
    });
    
    // Step 3: Check if any running jobs have completed their quantum or finished
    for (let i = 0; i < numCPUs; i++) {
      if (runningJobs[i] !== null && currentTime >= jobEndTimes[i]) {
        const runningJobId = runningJobs[i]!.id;
        const job = jobs.find(j => j.id === runningJobId);
        
        if (job && job.remainingTime! > 0) {
          // If job still has work remaining, put it back in the queue
          readyQueue.push({ ...job });
        }
        
        // Clear the CPU
        runningJobs[i] = null;
      }
    }
    
    // Step 4: Assign jobs to available CPUs
    const assignedJobIds = new Set<string>();
    
    // For the last remaining job, track which CPUs are currently idle
    const isLastJob = jobs.filter(job => job.remainingTime! > 0).length === 1;
    const idleCPUs: number[] = [];
    
    // First, check which CPUs are idle
    for (let i = 0; i < numCPUs; i++) {
      if (runningJobs[i] === null) {
        idleCPUs.push(i);
      }
    }
    
    // If it's the last job, prefer to use the same CPU that ran it last
    if (isLastJob && readyQueue.length === 1) {
      const lastJob = readyQueue[0];
      const preferredCPU = lastCPUForJob[lastJob.id];
      
      // If the preferred CPU is idle, use it
      if (preferredCPU !== undefined && runningJobs[preferredCPU] === null) {
        assignCPU(preferredCPU, lastJob);
        readyQueue = [];
      }
      // Otherwise use any available CPU
      else if (idleCPUs.length > 0) {
        assignCPU(idleCPUs[0], lastJob);
        readyQueue = [];
      }
    } else {
      // Assign jobs to idle CPUs
      for (let i = 0; i < numCPUs && readyQueue.length > 0; i++) {
        if (runningJobs[i] === null) {
          // Try to find a job that was last on this CPU for continuity
          let foundJobIdx = -1;
          
          for (let j = 0; j < readyQueue.length; j++) {
            if (!assignedJobIds.has(readyQueue[j].id) && lastCPUForJob[readyQueue[j].id] === i) {
              foundJobIdx = j;
              break;
            }
          }
          
          // If no job with continuity is found, take the next one in queue
          if (foundJobIdx === -1) {
            foundJobIdx = readyQueue.findIndex(job => !assignedJobIds.has(job.id));
          }
          
          if (foundJobIdx !== -1) {
            const nextJob = readyQueue[foundJobIdx];
            assignedJobIds.add(nextJob.id);
            assignCPU(i, nextJob);
            
            // Remove the assigned job from the queue
            readyQueue.splice(foundJobIdx, 1);
          }
        }
      }
    }
    
    function assignCPU(cpuId: number, job: Job) {
      // If this is the first time this job is running, set its start time
      if (job.startTime === undefined) {
        job.startTime = currentTime;
      }
      
      // Calculate how long this job will run
      const timeToRun = Math.min(job.remainingTime!, quantum);
      const nextEndTime = currentTime + timeToRun;
      
      // Assign the job to the CPU
      runningJobs[cpuId] = { ...job };
      jobEndTimes[cpuId] = nextEndTime;
      lastCPUForJob[job.id] = cpuId;
      
      // Add to timeline
      timeline.push({
        cpuId: cpuId,
        jobId: job.id,
        jobName: job.name,
        startTime: currentTime,
        endTime: nextEndTime,
        isIdle: false
      });
    }
    
    // Step 5: For any CPU still idle, fill with idle time until next event
    const nextJobArrival = Math.min(
      ...jobs
        .filter(job => job.arrivalTime > currentTime && job.remainingTime! > 0)
        .map(job => job.arrivalTime),
      Infinity
    );
    
    // Next time any CPU finishes its current job
    const nextJobEnd = Math.min(
      ...jobEndTimes.filter((time, i) => runningJobs[i] !== null && time > currentTime),
      Infinity
    );
    
    const nextEventTime = Math.min(
      nextJobArrival,
      nextJobEnd,
      isFinite(nextJobEnd) ? nextJobEnd : Infinity
    );
    
    for (let i = 0; i < numCPUs; i++) {
      if (runningJobs[i] === null && isFinite(nextEventTime) && nextEventTime > currentTime) {
        // Add idle time to timeline
        timeline.push({
          cpuId: i,
          jobId: null,
          jobName: null,
          startTime: currentTime,
          endTime: nextEventTime,
          isIdle: true
        });
        jobEndTimes[i] = nextEventTime;
      }
    }
    
    // Step 6: Process time until next event
    // Find the next time to process (the minimum end time of any job)
    if (!isFinite(nextEventTime)) {
      break; // No more events to process
    }
    
    // Update job remaining times
    for (let i = 0; i < numCPUs; i++) {
      const runningJob = runningJobs[i];
      if (runningJob !== null) {
        const job = jobs.find(j => j.id === runningJob.id)!;
        const timeProcessed = nextEventTime - currentTime;
        job.remainingTime! -= timeProcessed;
        
        // Check if job completed
        if (job.remainingTime! <= 0) {
          job.endTime = nextEventTime;
          job.turnaroundTime = job.endTime - job.arrivalTime;
          job.waitingTime = job.turnaroundTime - job.burstTime;
          
          completedJobs.push({ ...job });
          
          // Remove job from queue if it's there
          const queueIdx = readyQueue.findIndex(qJob => qJob.id === job.id);
          if (queueIdx !== -1) {
            readyQueue.splice(queueIdx, 1);
          }
        }
      }
    }
    
    // Move time forward to the next event
    currentTime = nextEventTime;
  }
  
  // Sort completed jobs by name for consistent display
  completedJobs.sort((a, b) => a.name.localeCompare(b.name));
  
  // For debugging
  console.log("Round Robin Timeline data:", { 
    timelineLength: timeline.length,
    maxTime: Math.max(...timeline.map(event => event.endTime)),
    events: timeline.slice(0, 5) // Log first few events to check structure
  });
  
  // Ensure we have a valid maxTime
  const maxTime = Math.max(...timeline.map(event => Number.isFinite(event.endTime) ? event.endTime : 0));
  
  return {
    completedJobs,
    timeline,
    queueStates,
    maxTime,
    jobColors: assignJobColors(inputJobs)
  };
};
