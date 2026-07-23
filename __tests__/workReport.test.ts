import {buildWorkReport} from '../src/services/workReport';
import type {Day, Entry} from '../src/types';

const H = 3600;

function makeDay(overrides: Partial<Day> = {}): Day {
  return {
    id: 1,
    date: '2026-07-25',
    started_at: null,
    ended_at: null,
    started_at_2: null,
    ended_at_2: null,
    started_at_source: null,
    ended_at_source: null,
    notes: null,
    created_at: '2026-07-25T00:00:00.000Z',
    updated_at: '2026-07-25T00:00:00.000Z',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 1,
    day_id: 1,
    entry_type: 'note',
    activity_type: 'work',
    project_id: null,
    title: null,
    body: null,
    file_path: null,
    thumbnail_path: null,
    duration_sec: null,
    time_from: null,
    time_to: null,
    latitude: null,
    longitude: null,
    location_label: null,
    is_todo: false,
    scheduled_date: null,
    completed_at: null,
    reminder_at: null,
    created_at: '2026-07-25T08:00:00.000Z',
    updated_at: '2026-07-25T08:00:00.000Z',
    tags: [],
    project: null,
    ...overrides,
  };
}

const zeroDay = makeDay({id: 1, date: '2026-06-26'});
const workedDay = makeDay({
  id: 2,
  started_at: '2026-07-25T08:00:00.000Z',
  ended_at: '2026-07-25T16:00:00.000Z',
});
const workedEntries: Entry[] = [makeEntry({
  id: 2,
  day_id: 2,
  time_from: '2026-07-25T09:00:00.000Z',
  time_to: '2026-07-25T10:00:00.000Z',
})];

const base = {
  personName: 'Ada Example',
  companyName: 'Example Oy',
  startDate: '2026-07-25',
  endDate: '2026-07-25',
  language: 'en' as const,
  type: 'hours' as const,
  days: [workedDay],
  entries: workedEntries,
};

describe('buildWorkReport', () => {
  it('validates the person and date range', () => {
    expect(() => buildWorkReport({...base, personName: ' '}))
      .toThrow('report_person_required');
    expect(() => buildWorkReport({...base, startDate: '2026-07-26', endDate: '2026-07-25'}))
      .toThrow('report_invalid_range');
  });

  it('includes only positive in-range day rows', () => {
    const report = buildWorkReport({
      ...base,
      startDate: '2026-06-26',
      endDate: '2026-07-25',
      days: [zeroDay, workedDay],
      entries: workedEntries,
    });

    expect(report.days).toHaveLength(1);
    expect(report.days[0].date).toBe('25 Jul 2026');
    expect(report.days[0].weekday).toBe('Saturday');
    expect(report.days[0].hours).toBe('8:00');
  });

  it('includes only eligible completed work titles as headlines', () => {
    const report = buildWorkReport({
      ...base,
      type: 'headlines',
      entries: [
        makeEntry({id: 1, day_id: 2, title: ' Client call ', created_at: '2026-07-25T08:00:00.000Z'}),
        makeEntry({id: 2, day_id: 2, activity_type: 'personal_work', title: 'Doctor'}),
        makeEntry({id: 3, day_id: 2, activity_type: 'personal', title: 'Doctor'}),
        makeEntry({
          id: 4,
          day_id: 2,
          title: 'Private project',
          project: {
            id: 4,
            name: 'Private project',
            type: 'personal',
            archived: false,
            created_at: '2026-07-25T00:00:00.000Z',
            updated_at: '2026-07-25T00:00:00.000Z',
          },
        }),
        makeEntry({id: 5, day_id: 2, title: 'Pending task', is_todo: true}),
        makeEntry({
          id: 6,
          day_id: 2,
          title: 'Completed task',
          is_todo: true,
          completed_at: '2026-07-25T10:00:00.000Z',
        }),
      ],
    });

    expect(report.days[0].headlines).toEqual([
      'Client call',
      'Completed task',
    ]);
    expect(JSON.stringify(report)).not.toContain('Doctor');
    expect(JSON.stringify(report)).not.toContain('Private project');
  });

  it('accounts for project and tag remainders once', () => {
    const day = makeDay({
      id: 3,
      date: '2026-07-26',
      started_at: '2026-07-26T08:00:00.000Z',
      ended_at: '2026-07-26T13:00:00.000Z',
    });
    const project = {
      id: 1,
      name: 'Project A',
      type: 'work' as const,
      archived: false,
      created_at: '2026-07-26T00:00:00.000Z',
      updated_at: '2026-07-26T00:00:00.000Z',
    };
    const personalProject = {...project, id: 2, name: 'Personal project', type: 'personal' as const};
    const report = buildWorkReport({
      ...base,
      type: 'statistics',
      startDate: '2026-07-26',
      endDate: '2026-07-26',
      days: [day],
      entries: [
        makeEntry({
          id: 1,
          day_id: 3,
          project_id: project.id,
          project,
          time_from: '2026-07-26T13:00:00.000Z',
          time_to: '2026-07-26T16:00:00.000Z',
          tags: [
            {id: 1, name: 'Customer', created_at: '2026-07-26T00:00:00.000Z'},
            {id: 2, name: 'Urgent', created_at: '2026-07-26T00:00:00.000Z'},
          ],
        }),
        makeEntry({
          id: 2,
          day_id: 3,
          time_from: '2026-07-26T16:00:00.000Z',
          time_to: '2026-07-26T18:00:00.000Z',
        }),
        makeEntry({
          id: 3,
          day_id: 3,
          activity_type: 'personal_work',
          time_from: '2026-07-26T08:00:00.000Z',
          time_to: '2026-07-26T09:00:00.000Z',
        }),
        makeEntry({
          id: 4,
          day_id: 3,
          project_id: personalProject.id,
          project: personalProject,
          time_from: '2026-07-26T18:00:00.000Z',
          time_to: '2026-07-26T19:00:00.000Z',
        }),
      ],
    });

    expect(report.meta.totalHours).toBe('10:00');
    expect(report.statistics!.projectRows.map(row => [row.label, row.seconds])).toEqual([
      ['Project A', 3 * H],
      ['Untracked work', 7 * H],
    ]);
    expect(report.statistics!.tagRows.map(row => [row.label, row.seconds])).toEqual([
      ['Customer', 3 * H],
      ['Urgent', 3 * H],
      ['Untracked work', 7 * H],
    ]);
  });

  it('uses Finnish dates and fixed report copy without global i18n', () => {
    const report = buildWorkReport({
      ...base,
      language: 'fi',
      type: 'statistics',
    });

    expect(report.meta).toMatchObject({
      title: 'Työaikaraportti',
      totalLabel: 'Tunteja yhteensä',
      pageLabel: 'Sivu',
    });
    expect(report.columns).toEqual({
      date: 'Päivä',
      weekday: 'Viikonpäivä',
      hours: 'Tunnit',
    });
    expect(report.days[0]).toMatchObject({
      date: '25 heinä 2026',
      weekday: 'lauantaina',
    });
    expect(report.statistics).toMatchObject({
      title: 'Tilastot',
      byProjectTitle: 'Projekteittain',
      byTagTitle: 'Tunnisteittain',
      nonExclusiveNote: 'Tunnisteiden tunnit eivät sulje toisiaan pois.',
    });
    expect(report.statistics!.projectRows[0].label).toBe('Kohdistamaton työ');
    expect(report.statistics!.tagRows[0].label).toBe('Kohdistamaton työ');
  });
});
