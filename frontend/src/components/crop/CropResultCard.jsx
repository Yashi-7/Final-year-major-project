import CropImage from './CropImage.jsx';
import { getCropPlantingTip } from '../../data/cropPlantingTips.js';

const CropResultCard = ({ rank, crop, slug }) => (
  <li className="card flex flex-col gap-3 p-3">
    <div className="relative">
      <CropImage crop={crop} slug={slug} />
      <span
        aria-hidden="true"
        className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-agri-700 text-xs font-bold text-white shadow"
      >
        {rank}
      </span>
    </div>
    <h4 className="px-1 text-center text-base font-semibold text-agri-900">
      <span className="sr-only">Recommendation {rank}: </span>
      {crop}
    </h4>
    <div className="rounded-lg bg-agri-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-agri-800">Planting tip</p>
      <p className="mt-1 text-sm leading-5 text-gray-700">{getCropPlantingTip(crop)}</p>
    </div>
  </li>
);

export default CropResultCard;
