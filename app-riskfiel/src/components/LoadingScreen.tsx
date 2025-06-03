
import { Loader2 } from 'lucide-react';

const LoadingScreen = () => {
  return (
    <div className="h-screen w-full flex flex-col items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="mt-4 text-muted-foreground">Loading...</p>
    </div>
  );
};

export default LoadingScreen;
