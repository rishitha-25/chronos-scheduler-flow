
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SchedulingResult } from "@/types/scheduler";

interface ResultsProps {
  results: SchedulingResult;
}

const Results = ({ results }: ResultsProps) => {
  const { completedJobs } = results;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job Name</TableHead>
            <TableHead>Arrival Time</TableHead>
            <TableHead>Burst Time</TableHead>
            <TableHead>Start Time</TableHead>
            <TableHead>End Time</TableHead>
            <TableHead>Turnaround Time</TableHead>
            <TableHead>Waiting Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {completedJobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell>{job.name}</TableCell>
              <TableCell>{job.arrivalTime}</TableCell>
              <TableCell>{job.burstTime}</TableCell>
              <TableCell>{job.startTime}</TableCell>
              <TableCell>{job.endTime}</TableCell>
              <TableCell>{job.turnaroundTime}</TableCell>
              <TableCell>{job.waitingTime}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {completedJobs.length > 0 && (
        <div className="mt-4 text-sm text-muted-foreground">
          <p>
            Average Turnaround Time:{" "}
            {(
              completedJobs.reduce((sum, job) => sum + (job.turnaroundTime || 0), 0) /
              completedJobs.length
            ).toFixed(2)}
          </p>
          <p>
            Average Waiting Time:{" "}
            {(
              completedJobs.reduce((sum, job) => sum + (job.waitingTime || 0), 0) /
              completedJobs.length
            ).toFixed(2)}
          </p>
        </div>
      )}
    </div>
  );
};

export default Results;
