import WelcomeNav from './WelcomeNav';
import GlassAtmosphere from './GlassAtmosphere';

export default function WelcomeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="welcome">
      <a className="welcome-skip" href="#welcome-content">Skip to content</a>
      <GlassAtmosphere />
      <WelcomeNav />
      {children}
    </div>
  );
}
