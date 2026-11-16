CROP RECOMMENDATION UPDATE - QUICK START

This package includes:
- The existing trained crop model and metadata in ml-service/models/crop_recommendation/
- The source dataset in ml-service/data/ for optional retraining
- Farmer form with location + soil type only
- Automatic climate lookup using Open-Meteo
- Five model-ranked crop recommendations
- Wikimedia Commons real-photo lookup with a local fallback
- Basic planting tips on recommendation cards

IMPORTANT MODEL NOTES
1. The model's required feature order is:
   nitrogen, phosphorus, potassium, ph, temperature, rainfall, humidity,
   season:Kharif, season:Rabi, season:Summer, season:Whole Year,
   season:Winter, season:Autumn.
   Do not rearrange these columns to a different order.
2. NPK and pH are estimated from the selected soil category; they are not measured.
3. The original evaluation metrics in metadata.json are top-3 metrics. The UI now displays top 5, so do not describe the stored metrics as top-5 performance.
4. The model can return similar crops for similar input features. Location is not a direct model feature; it influences climate retrieval. Do not randomize predictions.
5. Wikimedia Commons photos require internet. If no suitable image is found, the local fallback remains visible.

Run:
- backend: cd backend && npm install && npm run dev
- ML: cd ml-service && python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt && python app.py
- frontend: cd frontend && npm install && npm run dev

Set backend/.env and ml-service/.env from the included example files before starting.
