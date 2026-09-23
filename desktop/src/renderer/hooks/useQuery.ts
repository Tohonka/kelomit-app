import {useEffect, useState} from 'react';
import type {QueryArgs, QueryName, QueryResult} from '../../main/queries.ts';

/**
 * Runs a named read and re-runs it whenever the phone pushes a new database.
 * `undefined` = not loaded yet, `null` = nothing pushed yet.
 */
export function useQuery<N extends QueryName>(
  name: N,
  ...args: QueryArgs<N>
): QueryResult<N> | null | undefined {
  const [data, setData] = useState<QueryResult<N> | null | undefined>(undefined);
  const key = JSON.stringify(args);

  useEffect(() => {
    let live = true;
    const load = () => {
      window.kelomit
        .query(name, ...args)
        .then(r => {
          if (live) setData(r);
        })
        .catch(e => console.error(`query ${name} failed`, e));
    };
    load();
    const off = window.kelomit.onDbChanged(load);
    return () => {
      live = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, key]);

  return data;
}
