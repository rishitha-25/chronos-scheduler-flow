
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
  
  timelineData.forEach((event) => {
    if (!timelineByCP[event.cpuId]) {
      timelineByCP[event.cpuId] = [];
    }
    timelineByCP[event.cpuId].push(event);
  });

  // Check if maxTime is valid to prevent "Invalid array length" error
  const safeMaxTime = maxTime > 0 && maxTime < 1000 ? maxTime : 0;

  return (
    <div>
      <h3 className="text-lg font-medium mb-3">Timeline</h3>
      <div className="space-y-4">
        {Array.from({ length: numCPUs }, (_, i) => i).map((cpuId) => (
          <div key={cpuId} className="space-y-1">
            <div className="text-sm font-medium">CPU {cpuId + 1}</div>
            <div className="relative h-10 bg-gray-100 rounded">
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
                >
                  {event.jobName || "Idle"}
                </div>
              ))}
            </div>
            <div className="relative h-6">
              {/* This is where the error was occurring */}
              {safeMaxTime > 0 ? 
                Array.from({ length: Math.min(safeMaxTime + 1, 100) }, (_, i) => 
                  i * (safeMaxTime > 20 ? Math.ceil(safeMaxTime / 20) : 1)
                )
                .filter(time => time <= safeMaxTime)
                .map((time) => (
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
                ))
              : <div className="text-xs text-gray-500">No timeline data</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline;
