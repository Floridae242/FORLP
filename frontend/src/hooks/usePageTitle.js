import { useEffect } from 'react';

const BASE = import.meta.env.VITE_VENUE_NAME || 'กาดกองต้า Smart Insight';

export default function usePageTitle(page) {
    useEffect(() => {
        document.title = page ? `${page} — ${BASE}` : BASE;
        return () => { document.title = BASE; };
    }, [page]);
}
