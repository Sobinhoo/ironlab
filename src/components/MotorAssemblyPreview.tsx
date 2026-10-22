import type { GearStage } from '../utils/motorProfiles';
import './MotorAssemblyPreview.css';

type Props = { stages: GearStage[] };
/** Ilustração SVG modular, sem alterar as leituras de hardware. */
export default function MotorAssemblyPreview({ stages }: Props) {
  const offset = stages.length * 41;
  return (
    <div className="motor-assembly-preview">
      <svg viewBox="0 0 420 210" role="img" aria-label={`REV HD Hex com ${stages.length} módulos de redução`}>
        <defs>
          <linearGradient id="labSteel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e2e5e5"/><stop offset=".48" stopColor="#838b8d"/><stop offset="1" stopColor="#c1c8c8"/></linearGradient>
          <linearGradient id="labGear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#40474b"/><stop offset=".48" stopColor="#14181b"/><stop offset="1" stopColor="#333b3d"/></linearGradient>
        </defs>
        <g transform={`translate(${42 - offset / 2} 0)`}>
          <rect x={95 + offset} y="56" width="204" height="101" rx="24" fill="url(#labSteel)" stroke="#596164" strokeWidth="2"/>
          <rect x={147 + offset} y="57" width="110" height="99" rx="6" fill="#202428"/>
          <rect x={147 + offset} y="57" width="10" height="99" fill="#ef6928"/>
          <rect x={247 + offset} y="57" width="10" height="99" fill="#ef6928"/>
          <text x={202 + offset} y="103" fontSize="26" fontWeight="900" fill="#f3f5f3" textAnchor="middle">REV</text>
          <text x={202 + offset} y="120" fontSize="9" letterSpacing="2" fill="#cdd6d0" textAnchor="middle">ROBOTICS</text>
          <rect x={290 + offset} y="65" width="25" height="83" rx="9" fill="#171c1e" stroke="#485052"/>
          <rect x={304 + offset} y="85" width="11" height="41" rx="3" fill="#0b0e0f"/>
          {stages.map((stage,i) => {
            const x = 95 + i * 41;
            return <g key={`${stage}-${i}`}>
              <rect x={x} y="62" width="44" height="89" rx="9" fill="url(#labGear)" stroke="#697174" strokeWidth="1.5"/>
              {[0,1,2,3].map(j=><rect key={j} x={x+6+j*9} y="68" width="5" height="77" rx="1" fill="#4c5758"/>)}
              <circle cx={x+22} cy="74" r="3" fill="#b9c3c1"/>
              <circle cx={x+22} cy="140" r="3" fill="#b9c3c1"/>
              <rect x={x-3} y="71" width="5" height="70" rx="2" fill="#899191"/>
              <text x={x+22} y="112" fill="#80e7aa" fontSize="12" fontWeight="800" textAnchor="middle">{stage}:1</text>
            </g>;
          })}
          {stages.length === 0 && <><rect x="88" y="66" width="12" height="81" rx="4" fill="#aeb9ba"/><circle cx="93" cy="106" r="21" fill="url(#labSteel)" stroke="#707b7b" strokeWidth="3"/></>}
          <rect x={67} y="101" width={28} height="11" rx="3" fill="#c0c8c7" stroke="#727e80"/>
          {[0,1,2,3,4].map(i=><path key={i} d={`M${71+i*5} 101 v11`} stroke="#667174" strokeWidth="1.5"/>)}
        </g>
      </svg>
      <div className="motor-assembly-caption">{stages.length ? `Motor + ${stages.length} módulo(s) UltraPlanetary` : 'REV HD Hex · sem caixa de redução externa'}</div>
    </div>
  );
}
