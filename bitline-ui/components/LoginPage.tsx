import React from 'react';
import { Zap, Shield, Users, TrendingUp } from 'lucide-react';

interface LoginPageProps {
  onLogin: () => void;
  isLoading?: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, isLoading }) => {
  return (
    <div className="min-h-screen bg-black flex flex-col relative overflow-hidden">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-orange-900/20 via-black to-amber-900/10" />
      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-orange-500/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      
      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col px-6 pt-16 pb-8">
        {/* Logo & Branding */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-500 to-amber-600 rounded-3xl mb-6 shadow-2xl shadow-orange-500/30">
            <Zap className="w-10 h-10 text-white fill-white" />
          </div>
          <h1 className="text-4xl font-black italic tracking-tighter text-white mb-2">
            BITLINE
          </h1>
          <p className="text-zinc-500 text-sm font-medium">
            Truth Wins.
          </p>
        </div>

        {/* Feature highlights */}
        <div className="space-y-4 mb-auto">
          <FeatureItem 
            icon={<Shield className="w-5 h-5" />}
            title="Stake to Speak"
            description="Posts require staking. Refunded in 24h if no violations."
          />
          <FeatureItem 
            icon={<Users className="w-5 h-5" />}
            title="AI Moderation"
            description="Fast, fair content review powered by AI."
          />
          <FeatureItem 
            icon={<TrendingUp className="w-5 h-5" />}
            title="Build Reputation"
            description="Quality posts boost your trust score."
          />
        </div>

        {/* Login Section */}
        <div className="mt-8 space-y-4">
          {/* Google Sign-In Button */}
          <button
            onClick={onLogin}
            disabled={isLoading}
            className="w-full bg-white text-zinc-900 font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-zinc-400 border-t-zinc-900 rounded-full animate-spin" />
            ) : (
              <>
                <GoogleIcon />
                <span>Continue with Google</span>
              </>
            )}
          </button>

          {/* Terms */}
          <p className="text-center text-[10px] text-zinc-600 px-4">
            By signing in, you agree to our
            <span className="text-zinc-400 underline"> Terms of Service </span>
            and
            <span className="text-zinc-400 underline"> Privacy Policy</span>
          </p>
        </div>

        {/* Bottom decoration */}
        <div className="mt-8 flex justify-center gap-1">
          {[...Array(5)].map((_, i) => (
            <div 
              key={i} 
              className="w-1 h-1 rounded-full bg-zinc-700"
              style={{ opacity: 1 - i * 0.15 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const FeatureItem: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
}> = ({ icon, title, description }) => (
  <div className="flex items-start gap-4 p-4 bg-zinc-900/50 border border-zinc-800/50 rounded-2xl backdrop-blur-sm">
    <div className="p-2 bg-orange-500/10 border border-orange-500/20 rounded-xl text-orange-500">
      {icon}
    </div>
    <div>
      <h3 className="font-bold text-zinc-100 text-sm mb-0.5">{title}</h3>
      <p className="text-zinc-500 text-xs">{description}</p>
    </div>
  </div>
);

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);
