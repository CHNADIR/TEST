
import { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  description?: string;
  footer?: ReactNode;
}

const AuthLayout = ({ children, title, description, footer }: AuthLayoutProps) => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/40">
      <div className="w-full max-w-md">
        <Card className="w-full shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">{title}</CardTitle>
            {description && <CardDescription className="text-center">{description}</CardDescription>}
          </CardHeader>
          <CardContent>
            {children}
          </CardContent>
          {footer && <CardFooter>{footer}</CardFooter>}
        </Card>
      </div>
    </div>
  );
};

export default AuthLayout;
