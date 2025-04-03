
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Job } from "@/types/scheduler";

interface ConfigurationFormProps {
  numCPUs: number;
  setNumCPUs: (value: number) => void;
  quantum: number;
  setQuantum: (value: number) => void;
  algorithm: "srtn" | "roundRobin";
  setAlgorithm: (value: "srtn" | "roundRobin") => void;
  schedulingMethod: "endTime" | "quantum";
  setSchedulingMethod: (value: "endTime" | "quantum") => void;
  onAddJob: (job: Job) => void;
  onSchedule: () => void;
}

const ConfigurationForm = ({
  numCPUs,
  setNumCPUs,
  quantum,
  setQuantum,
  algorithm,
  setAlgorithm,
  schedulingMethod,
  setSchedulingMethod,
  onAddJob,
  onSchedule,
}: ConfigurationFormProps) => {
  const [jobName, setJobName] = useState("");
  const [arrivalTime, setArrivalTime] = useState(0);
  const [burstTime, setBurstTime] = useState(1);

  const handleAddJob = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!jobName.trim()) return;
    
    onAddJob({
      id: "",
      name: jobName,
      arrivalTime,
      burstTime,
      remainingTime: burstTime,
    });

    // Reset form
    setJobName("");
    setArrivalTime(0);
    setBurstTime(1);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="num-cpus">Number of CPUs</Label>
          <Input
            id="num-cpus"
            type="number"
            min="1"
            value={numCPUs}
            onChange={(e) => setNumCPUs(parseInt(e.target.value) || 1)}
          />
        </div>
        <div>
          <Label htmlFor="quantum">Quantum</Label>
          <Input
            id="quantum"
            type="number"
            min="1"
            value={quantum}
            onChange={(e) => setQuantum(parseInt(e.target.value) || 1)}
          />
        </div>
      </div>

      <div>
        <Label>Algorithm</Label>
        <RadioGroup
          value={algorithm}
          onValueChange={(value) => setAlgorithm(value as "srtn" | "roundRobin")}
          className="flex items-center space-x-4 pt-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="srtn" id="srtn" />
            <Label htmlFor="srtn" className="cursor-pointer">SRTN</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="roundRobin" id="roundRobin" />
            <Label htmlFor="roundRobin" className="cursor-pointer">Round Robin</Label>
          </div>
        </RadioGroup>
      </div>

      <div>
        <Label>Scheduling Method</Label>
        <RadioGroup
          value={schedulingMethod}
          onValueChange={(value) => setSchedulingMethod(value as "endTime" | "quantum")}
          className="flex items-center space-x-4 pt-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="endTime" id="endTime" />
            <Label htmlFor="endTime" className="cursor-pointer">By End Time</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="quantum" id="quantum" />
            <Label htmlFor="quantum" className="cursor-pointer">By Quantum</Label>
          </div>
        </RadioGroup>
      </div>

      <div className="border-t pt-4">
        <h3 className="font-medium mb-2">Add New Job</h3>
        <form onSubmit={handleAddJob} className="space-y-4">
          <div>
            <Label htmlFor="job-name">Job Name</Label>
            <Input
              id="job-name"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              placeholder="e.g. Job A"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="arrival-time">Arrival Time</Label>
              <Input
                id="arrival-time"
                type="number"
                min="0"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(parseInt(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="burst-time">Burst Time</Label>
              <Input
                id="burst-time"
                type="number"
                min="1"
                value={burstTime}
                onChange={(e) => setBurstTime(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>
          <Button type="submit" className="w-full">Add Job</Button>
        </form>
      </div>

      <Button onClick={onSchedule} variant="default" className="w-full">
        Schedule Jobs
      </Button>
    </div>
  );
};

export default ConfigurationForm;
