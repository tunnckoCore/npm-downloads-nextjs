import { Card, CardContent } from "@/components/ui/card";

export function PackagePageSkeleton() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-4">
      <section className="w-full space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              npm downloads
            </h1>
            <p className="text-lg font-semibold text-muted-foreground">
              Analyze and visualize download stats for npm packages and authors.
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-6 gap-2 md:grid-cols-12">
          <div className="col-span-6 h-8 animate-pulse border border-input bg-secondary/40 md:col-span-6" />
          <div className="col-span-2 h-8 animate-pulse border border-input bg-secondary/40" />
          <div className="col-span-2 h-8 animate-pulse border border-input bg-secondary/40" />
          <div className="col-span-2 h-8 animate-pulse border border-input bg-secondary/40" />
        </div>
      </section>

      <section className="flex flex-col items-start justify-between gap-4 py-4 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-2">
          <div className="h-9 w-40 animate-pulse bg-secondary/40 sm:w-56" />
          <div className="flex items-center gap-2">
            <div className="h-6 w-36 animate-pulse bg-secondary/40" />
            <div className="h-4 w-40 animate-pulse bg-secondary/30" />
          </div>
        </div>

        <div className="inline-flex w-fit border border-input bg-secondary/40">
          <div className="h-8 w-20 animate-pulse border-r border-input bg-secondary/50" />
          <div className="h-8 w-20 animate-pulse border-r border-input bg-secondary/30" />
          <div className="h-8 w-20 animate-pulse bg-secondary/30" />
        </div>
      </section>

      <Card>
        <CardContent className="relative p-0 pr-5 pt-5">
          <div className="flex min-h-[24rem] flex-col justify-between px-5 pb-5">
            <div className="grid flex-1 grid-cols-[auto_1fr] gap-x-4">
              <div className="flex h-full flex-col justify-between py-4">
                {["0", "6m", "13m", "19m", "26m"].map((label) => (
                  <div key={label} className="h-4 w-8 animate-pulse bg-secondary/30" />
                ))}
              </div>

              <div className="relative flex h-full flex-col justify-between">
                <div className="absolute inset-0 flex flex-col justify-between py-4">
                  {["25", "50", "75", "100"].map((line) => (
                    <div key={line} className="border-t border-dashed border-border/60" />
                  ))}
                </div>

                <div className="relative flex flex-1 items-end px-4 pb-8 pt-4">
                  <div
                    className="h-3/5 w-full animate-pulse bg-secondary/30"
                    style={{
                      clipPath:
                        "polygon(0% 82%, 10% 58%, 23% 50%, 33% 40%, 45% 45%, 57% 32%, 69% 38%, 82% 22%, 92% 15%, 100% 55%, 100% 100%, 0% 100%)",
                    }}
                  />
                </div>

                <div className="flex items-center justify-between gap-4 px-4 pb-3">
                  {["mar", "jun", "sep", "dec", "next-mar"].map((tick) => (
                    <div key={tick} className="h-4 w-10 animate-pulse bg-secondary/30" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
