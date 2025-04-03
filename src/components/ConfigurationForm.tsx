
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Job } from "@/types/scheduler";
import { Separator } from "@/components/ui/separator";

interface ConfigurationFormProps {
  numCPUs: number;
  setNumCPUs: (value: number) => void;
  quantum: number;
  setQuantum: (value: number) => void;
  algorithm: "srtn" | "roundRobin";
  setAlgorithm: (value: "srtn" | "roundRobin") => void;
  onAddJob: (job: Job) => void;
  onSchedule: () => void;
  jobCount: number;
}

const ConfigurationForm = ({
  numCPUs,
  setNumCPUs,
  quantum,
  setQuantum,
  algorithm,
  setAlgorithm,
  onAddJob,
  onSchedule,
  jobCount
}: ConfigurationFormProps) => {
  const [arrivalTime, setArrivalTime] = useState<number>(0);
  const [burstTime, setBurstTime] = useState<number>(1);

  // Auto-name jobs as J1, J2, etc.
  const nextJobName = `J${jobCount + 1}`;

  const handleNumCPUsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (value > 0) {
      setNumCPUs(value);
    }
  };

  const handleQuantumChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (value > 0) {
      setQuantum(value);
    }
  };

  const handleAddJob = () => {
    if (burstTime <= 0) return;
    
    onAddJob({
      id: "",  // Will be assigned on add
      name: nextJobName,
      arrivalTime,
      burstTime,
    });

    // Reset arrival time and burst time after adding a job
    setArrivalTime(0);
    setBurstTime(1);
  };

  const handleArrivalTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (value >= 0) {
      setArrivalTime(value);
    }
  };

  const handleBurstTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (value > 0) {
      setBurstTime(value);
    }
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
            onChange={handleNumCPUsChange}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="quantum">Quantum</Label>
          <Input
            id="quantum"
            type="number"
            step="0.1"
            min="0.1"
            value={quantum}
            onChange={handleQuantumChange}
            className="mt-1"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Algorithm</Label>
        <RadioGroup
          value={algorithm}
          onValueChange={(value) => setAlgorithm(value as "srtn" | "roundRobin")}
          className="flex space-x-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="srtn" id="srtn" />
            <Label htmlFor="srtn">SRTN</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="roundRobin" id="roundRobin" />
            <Label htmlFor="roundRobin">Round Robin</Label>
          </div>
        </RadioGroup>
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="font-medium">Add Job</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="arrival-time">Arrival Time</Label>
            <Input
              id="arrival-time"
              type="number"
              step="0.1"
              min="0"
              value={arrivalTime}
              onChange={handleArrivalTimeChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="burst-time">Burst Time</Label>
            <Input
              id="burst-time"
              type="number"
              step="0.1"
              min="0.1"
              value={burstTime}
              onChange={handleBurstTimeChange}
              className="mt-1"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleAddJob}>Add Job</Button>
        </div>
      </div>

      <div className="pt-2">
        <Button onClick={onSchedule} className="w-full" disabled={jobCount === 0}>
          Schedule
        </Button>
      </div>
    </div>
  );
};

export default ConfigurationForm;
