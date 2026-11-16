# Crop recommendation form update

## What changed
- Farmer-facing form now asks only for farm location and soil category.
- The frontend resolves the location with Open-Meteo geocoding and fetches climate inputs automatically.
- It converts those details into the existing model's required fields and sends only the original validated schema to the existing backend/ML service.
- The selected season is inferred from the current month.
- Crop result cards search Wikimedia Commons for a real crop photograph and retain the existing local illustration as a fallback. Each result also shows a basic planting tip.

## Important accuracy note
The bundled trained Random Forest model is included under `ml-service/models/crop_recommendation/`. It was trained with 47 crop classes and requires nitrogen, phosphorus, potassium and pH. A location or soil-category label cannot determine these measurements accurately. This implementation uses clearly disclosed approximate soil-category values so the existing model can run without asking the farmer for technical inputs. For a real deployment, replace those estimates with soil-test data or a validated soil-data source. Historical climate data is preferred; if unavailable, a clearly disclosed short-range fallback is used.

## Run locally
1. Extract the ZIP.
2. Start the backend, ML service and frontend using the existing README instructions.
3. Make sure the ML model files are present under `ml-service/models/crop_recommendation/` and other existing project configuration is intact.
4. The browser needs internet access for weather/geocoding and Wikimedia Commons image search.

## Quick verification
- Log in as a farmer.
- Open Crop Recommendation.
- Enter a location such as `Meerut, Uttar Pradesh`, select a soil category, and submit.
- Verify recommendations are returned and photos load. If Commons has no suitable photo or is unreachable, the existing local illustration is shown.
- Also test login, farmer dashboard, and yield prediction because they are outside this change.

The frontend production build was not verified in this environment because dependency installation timed out. Run `npm install` and `npm run build` from `frontend/` on your machine before the viva.


## Recommendation count and repeated crops
- The inference schema now returns the top five model-ranked crops instead of three.
- The model was trained on seven numeric climate/soil features plus one-hot season indicators; location and soil category are converted into those features before prediction. If two farms produce the same feature vector, a deterministic Random Forest can return the same ranking. It is not safe to randomize crops just to make results look different.
- `metadata.json` retains the original holdout metrics, which were measured at top-3. Those metrics should not be presented as top-5 metrics.
- The included `district_agriculture_ml_ready.csv` is placed in `ml-service/data/` for optional retraining; normal prediction does not need the CSV.
