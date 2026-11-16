import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { MAX_SIGNERS, MIN_SIGNERS, setSigners, type Release } from '../../../services/releasesApiService';
import { describePerson, type PersonOption } from '../../../services/usersApiService';
import { UserPicker } from '../UserPicker';
import { type Act, Badge, SectionHeader, btn, card } from './common';

/** One person in a signer list: name, designation · department, and a tag or remove button. */
export const SignerRow: React.FC<{ name: string; detail: string; tag?: React.ReactNode; onRemove?: () => void }> = ({ name, detail, tag, onRemove }) => (
  <li className="flex items-center gap-2 px-3 py-2">
    <div className="min-w-0 flex-1">
      <div className="text-xs font-semibold text-[var(--text)] truncate">{name}</div>
      {detail && <div className="text-[11px] text-[var(--text-dim)] truncate">{detail}</div>}
    </div>
    {tag}
    {onRemove && (
      <button type="button" aria-label={`Remove ${name}`} onClick={onRemove} className="p-1 rounded text-[var(--text-dim)] hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
    )}
  </li>
);

export const signerList = 'rounded-lg border border-[var(--border-soft)] divide-y divide-[var(--border-soft)]';

/**
 * Who signs off this release (SRS-045): the creator and 1 to 4 others. Only the
 * creator changes the list, until a build is Final. Someone removed after
 * approving keeps their decision on record, but it no longer counts; someone
 * added later has to approve too.
 */
export const SignersPanel: React.FC<{ release: Release; act: Act }> = ({ release, act }) => {
  const saved: PersonOption[] = release.signers.filter((s) => s.userId !== release.createdBy).map((s) => ({ id: s.userId, name: s.name, designation: s.designation, department: s.department }));
  const [others, setOthers] = useState<PersonOption[]>(saved);
  const key = saved.map((p) => p.id).join(',');
  useEffect(() => setOthers(saved), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const creator = release.signers.find((s) => s.userId === release.createdBy);
  const editable = release.canEdit && !release.signersLocked;
  const changed = others.map((p) => p.id).join(',') !== key;
  const total = 1 + others.length;

  return (
    <section aria-label="Signers" className={`${card} space-y-3`}>
      <SectionHeader
        title={`Signers (${total} of ${MAX_SIGNERS})`}
        description={<>
          Each build needs approval from every signer before it can be promoted to Final.
          {release.signersLocked && ' The signers can no longer change.'}
          {!release.signersLocked && !release.canEdit && ' Only the creator changes who signs.'}
        </>}
      />
      <ul className={signerList}>
        {creator && <SignerRow name={creator.name} detail={describePerson(creator)} tag={<Badge tone="blue">Creator</Badge>} />}
        {others.map((p) => (
          <SignerRow key={p.id} name={p.name} detail={describePerson(p)} onRemove={editable ? () => setOthers(others.filter((o) => o.id !== p.id)) : undefined} />
        ))}
      </ul>
      {editable && (
        <div className="space-y-2">
          <UserPicker excludeIds={[release.createdBy, ...others.map((p) => p.id)]} disabled={total >= MAX_SIGNERS} label="Add a signer"
            placeholder={total >= MAX_SIGNERS ? `At most ${MAX_SIGNERS} signers` : 'Type a name to add a signer…'} onPick={(p) => setOthers([...others, p])} />
          {total < MIN_SIGNERS && <p role="status" className="text-[11px] text-amber-700">A release needs at least {MIN_SIGNERS} signers.</p>}
          <div className="flex justify-end">
            <button type="button" disabled={!changed || total < MIN_SIGNERS} onClick={() => act(() => setSigners(release.id, others.map((p) => p.id)), 'Signers saved.')} className={`${btn} bg-emerald-700 hover:bg-emerald-800 text-white`}>Save signers</button>
          </div>
        </div>
      )}
    </section>
  );
};
