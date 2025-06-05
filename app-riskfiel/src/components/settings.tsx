import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useTheme } from './theme-provider';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Eye,
  EyeOff,
  Lock,
  Moon,
  Sun,
  Languages,
  Save,
  Loader2,
  CheckSquare
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Le mot de passe actuel est requis'),
  newPassword: z.string()
    .min(12, 'Le mot de passe doit contenir au moins 12 caractères')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une lettre majuscule')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une lettre minuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
    .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un caractère spécial'),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

// Indicateur visuel de la force du mot de passe
const PasswordStrengthIndicator = ({ password }: { password: string }) => {
  const getStrengthPercent = () => {
    if (!password) return 0;
    
    let strength = 0;
    if (password.length >= 12) strength += 25;
    if (/[A-Z]/.test(password)) strength += 25;
    if (/[a-z]/.test(password)) strength += 25;
    if (/[0-9]/.test(password)) strength += 12.5;
    if (/[^A-Za-z0-9]/.test(password)) strength += 12.5;
    
    return strength;
  };

  const strengthPercent = getStrengthPercent();
  const getColor = () => {
    if (strengthPercent < 50) return "bg-red-500";
    if (strengthPercent < 75) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="mt-2">
      <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
        <div 
          className={`h-2.5 rounded-full ${getColor()}`} 
          style={{ width: `${strengthPercent}%` }}
        ></div>
      </div>
      <p className="text-xs mt-1 text-gray-500">
        Force du mot de passe: {strengthPercent < 50 ? "Faible" : strengthPercent < 75 ? "Moyenne" : "Forte"}
      </p>
    </div>
  );
};

const SettingsComponent = () => {
  const { setTheme, theme } = useTheme();
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPasswordValue, setNewPasswordValue] = useState('');

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    }
  });

  const onPasswordSubmit = async (data: PasswordFormValues) => {
    setIsChangingPassword(true);
    try {
      // Première étape : vérifier le mot de passe actuel
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: data.currentPassword,
      });

      if (signInError) {
        toast.error("Mot de passe actuel incorrect");
        return;
      }

      // Deuxième étape : mettre à jour le mot de passe
      const { error: updateError } = await supabase.auth.updateUser({
        password: data.newPassword
      });

      if (updateError) {
        toast.error(`Erreur lors de la mise à jour du mot de passe: ${updateError.message}`);
        return;
      }

      toast.success("Mot de passe mis à jour avec succès!", {
        duration: 5000,
        className: "bg-green-50",
        description: "Votre mot de passe a été modifié et sécurisé. Vos données sont maintenant mieux protégées.",
        icon: <CheckSquare className="h-5 w-5 text-green-500" />,
        position: "top-center",
        style: {
          border: "1px solid #10B981",
          borderRadius: "0.5rem",
        },
      });

      passwordForm.reset();
    } catch (error) {
      toast.error("Une erreur est survenue lors du changement de mot de passe");
      console.error(error);
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleLanguageChange = async (value: string) => {
    setIsSavingPreferences(true);
    try {
      i18n.changeLanguage(value);
      
      // Sauvegarder la préférence de langue dans les métadonnées de l'utilisateur
      const { error } = await supabase.auth.updateUser({
        data: { 
          ...user?.user_metadata,
          preferred_language: value 
        }
      });

      if (error) throw error;
      
      toast.success(t('settings.language.success', { language: value === 'fr' ? 'français' : 'English' }));
    } catch (error) {
      toast.error("Erreur lors du changement de langue");
      console.error(error);
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const handleThemeChange = async (checked: boolean) => {
    setIsSavingPreferences(true);
    try {
      const newTheme = checked ? 'dark' : 'light';
      
      // Log pour le débogage
      console.log('Changing theme to:', newTheme);
      
      // Définir explicitement le thème
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(newTheme);
      
      setTheme(newTheme);
      
      // Sauvegarder la préférence de thème dans les métadonnées de l'utilisateur
      const { error } = await supabase.auth.updateUser({
        data: { 
          ...user?.user_metadata,
          preferred_theme: newTheme 
        }
      });

      if (error) throw error;
      
      toast.success(`Thème changé en mode ${newTheme === 'dark' ? 'sombre' : 'clair'}`);
    } catch (error) {
      toast.error("Erreur lors du changement de thème");
      console.error(error);
    } finally {
      setIsSavingPreferences(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-8">
      <h1 className="text-3xl font-bold">{t('settings.title')}</h1>
      
      <Tabs defaultValue="password" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="password">
            <Lock className="h-4 w-4 mr-2" />
            {t('settings.password.title')}
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Sun className="h-4 w-4 mr-2" />
            {t('settings.appearance.title')}
          </TabsTrigger>
          <TabsTrigger value="language">
            <Languages className="h-4 w-4 mr-2" />
            {t('settings.language.title')}
          </TabsTrigger>
        </TabsList>
        
        {/* Section Mot de passe */}
        <TabsContent value="password">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.password.title')}</CardTitle>
              <CardDescription>
                {t('settings.password.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...passwordForm}>
                <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-6">
                  <FormField
                    control={passwordForm.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mot de passe actuel</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              {...field}
                              type={showCurrentPassword ? "text" : "password"}
                              disabled={isChangingPassword}
                              placeholder="Entrez votre mot de passe actuel"
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-2 top-1/2 -translate-y-1/2"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          >
                            {showCurrentPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={passwordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nouveau mot de passe</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              {...field}
                              type={showNewPassword ? "text" : "password"}
                              disabled={isChangingPassword}
                              placeholder="Entrez votre nouveau mot de passe"
                              onChange={(e) => {
                                field.onChange(e);
                                setNewPasswordValue(e.target.value);
                              }}
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-2 top-1/2 -translate-y-1/2"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                          >
                            {showNewPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        {newPasswordValue && <PasswordStrengthIndicator password={newPasswordValue} />}
                        <FormDescription>
                          Votre mot de passe doit contenir au moins 12 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirmer le mot de passe</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              {...field}
                              type={showConfirmPassword ? "text" : "password"}
                              disabled={isChangingPassword}
                              placeholder="Confirmez votre nouveau mot de passe"
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-2 top-1/2 -translate-y-1/2"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <Button type="submit" disabled={isChangingPassword} className="w-full">
                    {isChangingPassword ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Changement en cours...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Changer le mot de passe
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Section Apparence */}
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.appearance.title')}</CardTitle>
              <CardDescription>
                {t('settings.appearance.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="dark-mode">Mode sombre</Label>
                  <p className="text-sm text-muted-foreground">
                    Basculer entre le mode clair et le mode sombre.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Sun className="h-5 w-5 text-muted-foreground" />
                  <Switch
                    id="dark-mode"
                    checked={theme === 'dark'}
                    onCheckedChange={(checked) => {
                      console.log('Switch toggled:', checked); // Log pour débogage
                      handleThemeChange(checked);
                    }}
                    disabled={isSavingPreferences}
                  />
                  <Moon className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Section Langue */}
        <TabsContent value="language">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.language.title')}</CardTitle>
              <CardDescription>
                {t('settings.language.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="language-select">{t('settings.language.selectLabel')}</Label>
                <Select
                  defaultValue={i18n.language || 'fr'}
                  onValueChange={handleLanguageChange}
                  disabled={isSavingPreferences}
                >
                  <SelectTrigger id="language-select" className="w-full">
                    <SelectValue placeholder={t('settings.language.placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fr">{t('settings.language.french')}</SelectItem>
                    <SelectItem value="en">{t('settings.language.english')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsComponent;