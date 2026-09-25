import {useState} from 'react';
import type {Project, Tag} from '../../../../src/types/index.ts';

const PROJECT_TYPES: Project['type'][] = ['work', 'personal', 'other'];

const cmd = (fn: string, args: unknown[], label: string) => window.kelomit.cmd(fn, args, label).catch(() => {});

function ProjectsPane({projects}: {projects: Project[]}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<Project['type']>('work');
  const add = () => {
    const n = name.trim();
    if (!n) return;
    cmd('projects.create', [n, type], `New project “${n}”`);
    setName('');
  };
  const rename = (p: Project) => {
    const n = prompt('Rename project', p.name)?.trim();
    if (n && n !== p.name) cmd('projects.rename', [p.id, n], `Rename project “${p.name}” → “${n}”`);
  };
  const merge = (p: Project) => {
    const others = projects.filter(o => o.id !== p.id);
    const pick = prompt(`Merge “${p.name}” into which project?\n${others.map(o => `${o.id}: ${o.name}`).join('\n')}`);
    const keep = others.find(o => String(o.id) === pick?.trim());
    if (keep && confirm(`Move every note of “${p.name}” to “${keep.name}” and delete “${p.name}”?`)) {
      cmd('projects.merge', [keep.id, p.id], `Merge project “${p.name}” into “${keep.name}”`);
    }
  };
  const remove = (p: Project) => {
    if (confirm(`Delete project “${p.name}”? Notes keep their text but lose the project.`)) {
      cmd('projects.delete', [p.id], `Delete project “${p.name}”`);
    }
  };
  return (
    <div>
      <h2>Projects</h2>
      <div className="add">
        <input placeholder="New project" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <select value={type} onChange={e => setType(e.target.value as Project['type'])}>
          {PROJECT_TYPES.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button className="btn primary" onClick={add}>
          Add
        </button>
      </div>
      <table>
        <tbody>
          {projects.map(p => (
            <tr key={p.id} className={p.archived ? 'archived' : ''}>
              <td>{p.name}</td>
              <td className="muted">{p.type}</td>
              <td className="actions">
                <button className="btn small" onClick={() => rename(p)}>
                  Rename
                </button>{' '}
                <button className="btn small" onClick={() => cmd(p.archived ? 'projects.unarchive' : 'projects.archive', [p.id], `${p.archived ? 'Unarchive' : 'Archive'} project “${p.name}”`)}>
                  {p.archived ? 'Unarchive' : 'Archive'}
                </button>{' '}
                <button className="btn small" onClick={() => merge(p)}>
                  Merge…
                </button>{' '}
                <button className="btn small danger" onClick={() => remove(p)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TagsPane({tags}: {tags: Tag[]}) {
  const [name, setName] = useState('');
  const add = () => {
    const n = name.trim().replace(/^#/, '');
    if (!n) return;
    cmd('tags.getOrCreate', [n], `New tag #${n}`);
    setName('');
  };
  const rename = (t: Tag) => {
    const n = prompt('Rename tag', t.name)?.trim().replace(/^#/, '');
    if (n && n !== t.name) cmd('tags.rename', [t.id, n], `Rename tag #${t.name} → #${n}`);
  };
  const merge = (t: Tag) => {
    const others = tags.filter(o => o.id !== t.id);
    const pick = prompt(`Merge #${t.name} into which tag?\n${others.map(o => `${o.id}: ${o.name}`).join('\n')}`);
    const keep = others.find(o => String(o.id) === pick?.trim());
    if (keep && confirm(`Retag every note of #${t.name} as #${keep.name} and delete #${t.name}?`)) {
      cmd('tags.merge', [keep.id, t.id], `Merge tag #${t.name} into #${keep.name}`);
    }
  };
  const remove = (t: Tag) => {
    if (confirm(`Delete tag #${t.name} from every note?`)) cmd('tags.delete', [t.id], `Delete tag #${t.name}`);
  };
  return (
    <div>
      <h2>Tags</h2>
      <div className="add">
        <input placeholder="New tag" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="btn primary" onClick={add}>
          Add
        </button>
      </div>
      <table>
        <tbody>
          {tags.map(t => (
            <tr key={t.id}>
              <td>#{t.name}</td>
              <td className="actions">
                <button className="btn small" onClick={() => rename(t)}>
                  Rename
                </button>{' '}
                <button className="btn small" onClick={() => merge(t)}>
                  Merge…
                </button>{' '}
                <button className="btn small danger" onClick={() => remove(t)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Projects and tags side by side. Every action is a queued command; the
 *  lists refresh when the phone's push lands. */
export function ProjectsTags({projects, tags}: {projects: Project[]; tags: Tag[]}) {
  return (
    <div className="manage">
      <ProjectsPane projects={projects} />
      <TagsPane tags={tags} />
    </div>
  );
}
