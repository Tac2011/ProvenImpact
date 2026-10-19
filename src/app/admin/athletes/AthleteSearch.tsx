'use client';

import Link from 'next/link';
import { useState } from 'react';
import { schoolText, searchAthletes, type ReportAthlete } from '@/lib/reports';

export function AthleteSearch({ athletes }: { athletes: ReportAthlete[] }) {
  const [query, setQuery] = useState('');
  const shown = searchAthletes(athletes, query);

  return (
    <div className="mt-6">
      <label htmlFor="athlete-search" className="font-medium">
        Search athletes
      </label>
      <input
        id="athlete-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Name, email, school, or sport"
        autoFocus
        className="mt-1 block w-full rounded border border-gray-300 p-2"
      />
      <p className="mt-2 text-sm text-gray-600">
        {shown.length} of {athletes.length} athletes
      </p>

      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-gray-600">No athletes match that search.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-gray-600">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Name</th>
                <th scope="col" className="px-3 py-2 font-medium">Email</th>
                <th scope="col" className="px-3 py-2 font-medium">School</th>
                <th scope="col" className="px-3 py-2 font-medium">Sport</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link href={`/admin/athletes/${a.id}`} className="font-medium text-blue-700 hover:underline">
                      {a.last_name}, {a.first_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{a.email ?? ''}</td>
                  <td className="px-3 py-2">{schoolText(a)}</td>
                  <td className="px-3 py-2">{a.sport}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
