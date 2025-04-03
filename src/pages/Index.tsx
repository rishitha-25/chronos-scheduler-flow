import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ConfigurationForm from "@/components/ConfigurationForm";
import JobsTable from "@/components/JobsTable";
import Timeline from "@/components/Timeline";
import JobQueue from "@/components/JobQueue";
import Results from "@/components/Results";
import { Job, SchedulingResult } from "@/types/scheduler";
import { scheduleSRTN, scheduleRoundRobin } from "@/utils/scheduler";

const Index = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [numCPUs, setNumCPUs] = useState<number>(1);
  const [quantum, setQuantum] = useState<number>(2);
  const [algorithm, setAlgorithm] = useState<"srtn" | "roundRobin">("srtn");
  const [results, setResults] = useState<SchedulingResult | null>(null);

  const handleSchedule = () => {
    if (jobs.length === 0) return;

    const schedulingFunction = algorithm === "srtn" ? scheduleSRTN : scheduleRoundRobin;
    const result = schedulingFunction(jobs, numCPUs, quantum);
    setResults(result);
  };

  const addJob = (job: Job) => {
    // Keep the job name from the form (already formatted as J1, J2, etc.)
    setJobs([...jobs, { ...job, id: Date.now().toString() }]);
  };

  const removeJob = (jobId: string) => {
    setJobs(jobs.filter(job => job.id !== jobId));
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold text-center mb-8">CPU Job Scheduling Visualizer</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <ConfigurationForm
              numCPUs={numCPUs}
              setNumCPUs={setNumCPUs}
              quantum={quantum}
              setQuantum={setQuantum}
              algorithm={algorithm}
              setAlgorithm={setAlgorithm}
              onAddJob={addJob}
              onSchedule={handleSchedule}
              jobCount={jobs.length}
            />
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <JobsTable jobs={jobs} onRemoveJob={removeJob} />
          </CardContent>
        </Card>
      </div>
      
      {results && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Results</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="table">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="table">Table</TabsTrigger>
                  <TabsTrigger value="charts">Timeline & Queue</TabsTrigger>
                </TabsList>
                <TabsContent value="table" className="pt-4">
                  <Results results={results} />
                </TabsContent>
                <TabsContent value="charts" className="pt-4">
                  <div className="space-y-8">
                    <Timeline 
                      timelineData={results.timeline} 
                      jobColors={results.jobColors}
                      maxTime={results.maxTime}
                      numCPUs={numCPUs}
                    />
                    <JobQueue 
                      queueStates={results.queueStates}
                      jobColors={results.jobColors}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Index;
