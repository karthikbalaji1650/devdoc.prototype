import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { MAX_SIGNERS, MIN_SIGNERS, setSigners, type Release } from '../../../services/releasesApiService';
import { describePerson, type PersonOption } from '../../../services/usersApiService';
import { UserPicker } from '../UserPicker';
import { type Act, Badge, btn, card } from './common';

/**
 * Who signs off this release (SRS-045): the creator and 1 to 4 others. Only the
 * creator changes the list, until a build is Final. Someone removed after
 * approving keeps their decision on record, but it no longer counts; someone
 * added later has to approve too.
 */
export const SignersPanel: React.FC<{ release: Release; act: Act }> = ({ release, act }) => {
  const saved: PersonOption[] = release.signers.filter((s) => s.userId !== release.createdBy).map((s) => ({ id: s.userId, name: s.name, title: s.title, department: s.department }));
  const [others, setOthers] = useState<PersonOption[]>(saved);
  const key = saved.map((p) => p.id).join(',');
  useEffect(() => setOthers(saved), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const creator = release.signers.find((s) => s.userId === release.createdBy);
  const editable = release.canEdit && !release.signersLocked;
  const changed = others.map((p) => p.id).join(',') !== key;
  const total = 1 + others.length;

  return (
    <section aria-label="Signers" className={`${card} space-y-2`}>
      <h3 className="text-sm font-bold text-slate-800">Signers ({total} of {MAX_SIGNERS})</h3>
      <p className="text-xs text-slate-500">
        Each build needs approval from every signer before it can be promoted to Final.
        {release.signersLocked && ' The signers can no longer change.'}
        {!release.signersLocked && !release.canEdit && ' Only the creator changes who signs.'}
      </p>
      <ul className="text-xs space-y-1">
        {creator && (
          <li className="flex items-center gap-2">
            <span className="font-semibold">{creator.name}</span><span className="text-slate-500">{describePerson(creator)}</span><Badge tone="blue">Creator</Badge>
          </li>
        )}
        {others.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="font-semibold">{p.name}</span><span className="text-slate-500">{describePerson(p)}</span>
            {editable && <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setOthers(others.filter((o) => o.id !== p.id))} className="text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>}
          </li>
        ))}
      </ul>
      {editable && (
        <>
          <UserPicker excludeIds={[release.createdBy, ...others.map((p) => p.id)]} disabled={total >= MAX_SIGNERS} label="Add a signer"
            placeholder={total >= MAX_SIGNERS ? `At most ${MAX_SIGNERS} signers` : 'Type a name to add a signer…'} onPick={(p) => setOthers([...others, p])} />
          {total < MIN_SIGNERS && <p role="status" className="text-[11px] text-amber-700">A release needs at least {MIN_SIGNERS} signers.</p>}
          <button type="button" disabled={!changed || total < MIN_SIGNERS} onClick={() => act(() => setSigners(release.id, others.map((p) => p.id)), 'Signers saved.')} className={`${btn} bg-emerald-700 hover:bg-emerald-800 text-white`}>Save signers</button>
        </>
      )}
    </section>
  );
};
