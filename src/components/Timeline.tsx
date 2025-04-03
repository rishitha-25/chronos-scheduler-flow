
import { ScrollArea } from "@/components/ui/scroll-area";
import { TimelineEvent } from "@/types/scheduler";

interface TimelineProps {
  timelineData: TimelineEvent[];
  jobColors: Record<string, string>;
  maxTime: number;
  numCPUs: number;
}

const Timeline = ({ timelineData, jobColors, maxTime, numCPUs }: TimelineProps) => {
  // Group timeline events by CPU
  const timelineByCP: Record<number, TimelineEvent[]> = {};
  
  // Ensure we're processing the timeline data
  if (timelineData && timelineData.length > 0) {
    timelineData.forEach((event) => {
      if (!timelineByCP[event.cpuId]) {
        timelineByCP[event.cpuId] = [];
      }
      timelineByCP[event.cpuId].push(event);
    });
  }

  // Check if maxTime is valid to prevent "Invalid array length" error
  const safeMaxTime = maxTime > 0 && maxTime < 10000 ? maxTime : 0;

  // Determine the time step for markers based on the timeline length
  const getTimeSteps = () => {
    if (safeMaxTime <= 0) return [];
    
    // For very short timelines, show more detailed markers
    if (safeMaxTime <= 10) {
      // For decimal times, show markers at appropriate intervals
      const step = safeMaxTime <= 5 ? 0.5 : 1;
      const steps = [];
      for (let i = 0; i <= safeMaxTime; i += step) {
        steps.push(Math.round(i * 10) / 10); // Round to nearest 0.1 to avoid floating point issues
      }
      return steps;
    }
    
    // For longer timelines, show fewer markers
    const markerCount = Math.min(20, Math.ceil(safeMaxTime)); // Ensure reasonable number of markers
    const step = Math.ceil(safeMaxTime / markerCount);
    const steps = [];
    for (let i = 0; i <= safeMaxTime; i += step) {
      steps.push(i);
    }
    return steps;
  };

  const timeSteps = getTimeSteps();

  // For debugging purposes
  console.log("Timeline component received data:", { 
    timelineData: timelineData?.length, 
    maxTime, 
    numCPUs, 
    cpuTimelines: Object.keys(timelineByCP).length
  });

  return (
    <div>
      <h3 className="text-lg font-medium mb-3">Timeline</h3>
      <ScrollArea className="w-full max-w-full">
        <div className="space-y-4 min-w-full pr-4">
          {numCPUs > 0 && safeMaxTime > 0 && timelineData && timelineData.length > 0 ? (
            Array.from({ length: numCPUs }, (_, i) => i).map((cpuId) => (
              <div key={cpuId} className="space-y-1">
                <div className="text-sm font-medium">CPU {cpuId + 1}</div>
                <div className="relative h-10 bg-gray-100 rounded" style={{ minWidth: '600px' }}>
                  {(timelineByCP[cpuId] || []).map((event, index) => (
                    <div
                      key={index}
                      className="absolute top-0 h-full flex items-center justify-center text-xs font-medium overflow-hidden"
                      style={{
                        left: `${(event.startTime / safeMaxTime) * 100}%`,
                        width: `${((event.endTime - event.startTime) / safeMaxTime) * 100}%`,
                        backgroundColor: event.isIdle ? "#e5e7eb" : jobColors[event.jobId || ""],
                        color: event.isIdle ? "#6b7280" : "#fff",
                        borderLeft: index > 0 ? "1px solid white" : "none",
                      }}
                      title={`${event.jobName || "Idle"}: ${event.startTime} - ${event.endTime}`}
                    >
                      {event.jobName || "Idle"}
                    </div>
                  ))}
                </div>
                <div className="relative h-6" style={{ minWidth: '600px' }}>
                  {timeSteps.map((time) => (
                    <div
                      key={time}
                      className="absolute text-xs text-gray-500"
                      style={{
                        left: `${(time / safeMaxTime) * 100}%`,
                        transform: "translateX(-50%)",
                      }}
                    >
                      {time}
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-500">No timeline data available</div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default Timeline;
