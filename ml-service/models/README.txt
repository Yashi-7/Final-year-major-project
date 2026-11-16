Trained model artifacts live here (they are large, so they ship as separate downloads):

  models/crop_recommendation/{model.joblib, metadata.json}
  models/yield_prediction/{model.joblib, metadata.json}

Either extract the model zips into ml-service/models/, or regenerate them from
district_agriculture_ml_ready.csv (copy it to ml-service/data/ first):

  pip install -r requirements-training.txt
  python training/train_crop_recommendation.py
  python training/train_yield_prediction.py

Without these files the ML service still starts, but the prediction endpoints
return 503 "unavailable" (never a fake result).
