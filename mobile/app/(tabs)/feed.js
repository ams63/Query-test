// "Latest" tab: newest questions across all categories (useful for people who like to answer)
import React, { useState } from 'react';
import SortTabs from '../../src/components/SortTabs';
import Feed from '../../src/components/Feed';
import { useApp } from '../../src/context/AppProvider';

export default function LatestFeed() {
  const { t } = useApp();
  const [sort, setSort] = useState('latest');
  return <Feed query={`sort=${sort}`} header={<SortTabs value={sort} onChange={setSort} />} emptyTitle={t('noPosts')} />;
}
