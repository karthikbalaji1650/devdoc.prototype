import React, { useState } from 'react';
import { MAX_SIGNERS, MIN_SIGNERS, RELEASE_TYPES, type NewRelease, type ReleaseType } from '../../../services/releasesApiService';
import { describePerson, type PersonOption } from '../../../services/usersApiService';
import { UserPicker } from '../UserPicker';
import { SignerRow, signerList } from './SignersPanel';
import { Badge, Field, SectionHeader, btn, card, input } from './common';

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
    <form aria-label="New release" className={`${card} space-y-6 max-w-4xl`} onSubmit={(e) => {
      e.preventDefault();
      onCreate({ version, type, targetDate, segment: segment || undefined, title: title || undefined, signerIds: others.map((p) => p.id) });
    }}>
      <section className="space-y-3">
        <SectionHeader title="New release" description="Version and target date are required; the rest can be filled in later." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Version"><input className={input} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v2.4.0" required /></Field>
          <Field label="Title (optional)" className="lg:col-span-3"><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Type"><select className={input} value={type} onChange={(e) => setType(e.target.value as ReleaseType)}>{RELEASE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Target date"><input type="date" className={input} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} required /></Field>
          <Field label="Customer segment / tenant" className="sm:col-span-2"><input className={input} value={segment} onChange={(e) => setSegment(e.target.value)} /></Field>
        </div>
      </section>

      <section aria-label="Signers" className="space-y-3 border-t border-[var(--border-soft)] pt-5">
        <SectionHeader title={`Who signs off (${1 + others.length} of ${MAX_SIGNERS})`}
          description={`You sign off too. Add ${MIN_SIGNERS - 1} to ${MAX_SIGNERS - 1} more people; every one of them has to approve a build before it can be promoted to Final.`} />
        <ul className={signerList}>
          <SignerRow name={creatorName} detail="you" tag={<Badge tone="blue">Creator</Badge>} />
          {others.map((p) => (
            <SignerRow key={p.id} name={p.name} detail={describePerson(p)} onRemove={() => setOthers(others.filter((o) => o.id !== p.id))} />
          ))}
        </ul>
        <UserPicker excludeIds={[creatorId, ...others.map((p) => p.id)]} disabled={!room} label="Add a signer" placeholder={room ? 'Type a name to add a signer…' : `At most ${MAX_SIGNERS} signers`} onPick={(p) => setOthers([...others, p])} />
        {!enough && <p role="status" className="text-[11px] text-amber-700">Add at least one more person.</p>}
      </section>

      <div className="flex justify-end gap-2 border-t border-[var(--border-soft)] pt-4">
        <button type="button" onClick={onCancel} className={`${btn} border border-slate-300`}>Cancel</button>
        <button type="submit" disabled={!enough} className={`${btn} bg-emerald-700 hover:bg-emerald-800 text-white`}>Create release</button>
      </div>
    </form>
  );
};
