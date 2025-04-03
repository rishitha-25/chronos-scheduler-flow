
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash } from "lucide-react";
import { Job } from "@/types/scheduler";

interface JobsTableProps {
  jobs: Job[];
  onRemoveJob: (jobId: string) => void;
}

const JobsTable = ({ jobs, onRemoveJob }: JobsTableProps) => {
  if (jobs.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">No jobs added yet. Add jobs to schedule.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job Name</TableHead>
            <TableHead>Arrival Time</TableHead>
            <TableHead>Burst Time</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell>{job.name}</TableCell>
              <TableCell>{job.arrivalTime}</TableCell>
              <TableCell>{job.burstTime}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveJob(job.id)}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default JobsTable;
