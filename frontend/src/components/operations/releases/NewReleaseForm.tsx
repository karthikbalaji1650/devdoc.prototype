import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { MAX_SIGNERS, MIN_SIGNERS, RELEASE_TYPES, type NewRelease, type ReleaseType } from '../../../services/releasesApiService';
import { describePerson, type PersonOption } from '../../../services/usersApiService';
import { UserPicker } from '../UserPicker';
import { btn, card, input } from './common';

/**
 * Anyone signed in can create a release. They are the first signer; they pick
 * 1 to 4 more people, who then have to approve each build before it can go Final.
 */
export const NewReleaseForm: React.FC<{ creatorName: string; creatorId: string; onCreate: (body: NewRelease) => void; onCancel: () => void }> = ({ creatorName, creatorId, onCreate, onCancel }) => {
  const [version, setVersion] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ReleaseType>('Minor');
  const [targetDate, setTargetDate] = useState('');
  const [segment, setSegment] = useState('');
  const [others, setOthers] = useState<PersonOption[]>([]);
  const room = others.length < MAX_SIGNERS - 1;
  const enough = others.length >= MIN_SIGNERS - 1;

  return (
    <form aria-label="New release" className={`${card} space-y-4`} onSubmit={(e) => {
      e.preventDefault();
      onCreate({ version, type, targetDate, segment: segment || undefined, title: title || undefined, signerIds: others.map((p) => p.id) });
    }}>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <label className="text-xs">Version<input className={input} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v2.4.0" required /></label>
        <label className="text-xs">Title (optional)<input className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="text-xs">Type<select className={input} value={type} onChange={(e) => setType(e.target.value as ReleaseType)}>{RELEASE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="text-xs">Target date<input type="date" className={input} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} required /></label>
        <label className="text-xs">Customer segment / tenant<input className={input} value={segment} onChange={(e) => setSegment(e.target.value)} /></label>
      </div>

      <section aria-label="Signers" className="space-y-2">
        <h3 className="text-sm font-bold text-slate-800">Who signs off ({1 + others.length} of {MAX_SIGNERS})</h3>
        <p className="text-xs text-slate-500">You sign off too. Add {MIN_SIGNERS - 1} to {MAX_SIGNERS - 1} more people; every one of them has to approve a build before it can be promoted to Final.</p>
        <ul className="text-xs space-y-1">
          <li className="flex items-center gap-2"><span className="font-semibold">{creatorName}</span><span className="text-slate-500">you · creator</span></li>
          {others.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className="font-semibold">{p.name}</span><span className="text-slate-500">{describePerson(p)}</span>
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setOthers(others.filter((o) => o.id !== p.id))} className="text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>
        <UserPicker excludeIds={[creatorId, ...others.map((p) => p.id)]} disabled={!room} label="Add a signer" placeholder={room ? 'Type a name to add a signer…' : `At most ${MAX_SIGNERS} signers`} onPick={(p) => setOthers([...others, p])} />
        {!enough && <p role="status" className="text-[11px] text-amber-700">Add at least one more person.</p>}
      </section>

      <div className="flex gap-2">
        <button type="submit" disabled={!enough} className={`${btn} bg-emerald-700 hover:bg-emerald-800 text-white`}>Create release</button>
        <button type="button" onClick={onCancel} className={`${btn} border border-slate-300`}>Cancel</button>
      </div>
    </form>
  );
};
