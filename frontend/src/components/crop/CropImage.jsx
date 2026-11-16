import { useEffect, useState } from 'react';

const BASE = import.meta.env.BASE_URL || '/';
export const FALLBACK_SRC = `${BASE}crops/fallback.svg`;
const SAFE_SLUG = /^[a-z0-9-]{1,80}$/;

/**
 * Fetches a real photograph from Wikimedia Commons for the recommended crop.
 * If the search fails or the image cannot load, the local illustration is shown.
 */
const CropImage = ({ crop, slug, className = '' }) => {
  const [src, setSrc] = useState(FALLBACK_SRC);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(FALLBACK_SRC);
    setLoaded(false);

    if (!crop || !SAFE_SLUG.test(slug || '')) return () => { cancelled = true; };

    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: `filetype:bitmap "${crop}" crop plant`,
      gsrnamespace: '6',
      gsrlimit: '10',
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: '600',
      format: 'json',
      origin: '*',
    });

    fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`)
      .then((response) => {
        if (!response.ok) throw new Error('Image search unavailable');
        return response.json();
      })
      .then((data) => {
        const pages = Object.values(data.query?.pages || {});
        const match = pages.find((page) => {
          const title = (page.title || '').toLowerCase();
          return title.includes(crop.toLowerCase()) && page.imageinfo?.[0]?.thumburl;
        }) || pages.find((page) => page.imageinfo?.[0]?.thumburl);
        const imageUrl = match?.imageinfo?.[0]?.thumburl || match?.imageinfo?.[0]?.url;
        if (!cancelled && imageUrl) setSrc(imageUrl);
      })
      .catch(() => {
        // Keep the local fallback visible when Commons is unreachable.
      });

    return () => { cancelled = true; };
  }, [crop, slug]);

  return (
    <div className={`relative h-36 w-full overflow-hidden rounded-xl bg-gray-100 ${className}`}>
      <img
        src={src}
        alt={src === FALLBACK_SRC ? `Illustration for ${crop}` : `Photograph of ${crop}`}
        width="600"
        height="360"
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => { setSrc(FALLBACK_SRC); setLoaded(false); }}
        className={`h-full w-full object-cover ${loaded ? '' : ''}`}
      />
      {src !== FALLBACK_SRC && (
        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          Wikimedia Commons
        </span>
      )}
    </div>
  );
};

export default CropImage;
