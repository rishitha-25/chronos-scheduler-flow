
import { QueueState } from "@/types/scheduler";

interface JobQueueProps {
  queueStates: QueueState[];
  jobColors: Record<string, string>;
}

const JobQueue = ({ queueStates, jobColors }: JobQueueProps) => {
  return (
    <div>
      <h3 className="text-lg font-medium mb-3">Job Queue</h3>
      <div className="overflow-x-auto">
        <div className="min-w-max space-y-3">
          {queueStates.map((state, index) => (
            <div key={index} className="border rounded p-3">
              <div className="text-sm font-medium mb-1">Time: {state.time}</div>
              <div className="flex flex-wrap gap-2">
                {state.jobs.length === 0 ? (
                  <div className="text-sm text-gray-500">Queue empty</div>
                ) : (
                  state.jobs.map((job, jobIndex) => (
                    <div
                      key={`${state.time}-${jobIndex}`}
                      className="px-2 py-1 rounded text-xs text-white flex items-center"
                      style={{ backgroundColor: jobColors[job.id] || "#888" }}
                    >
                      {job.name} ({job.remainingTime})
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default JobQueue;
