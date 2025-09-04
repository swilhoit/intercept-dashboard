-- Amazon Orders table
CREATE OR REPLACE TABLE `biz-hunter-oauth.amazon_seller.amazon_orders_2025` (
  Date STRING,
  ASIN STRING,
  Item_Price FLOAT64,
  Product_Name STRING,
  Purchase_Date STRING
);

-- Amazon Ads Keywords table  
CREATE OR REPLACE TABLE `biz-hunter-oauth.amazon_ads.keywords` (
  Customer_Search_Term STRING,
  Keyword_ID STRING,
  Keyword_Text STRING,
  Match_Type STRING,
  Ad_Group_ID STRING,
  Ad_Group_Name STRING,
  Campaign_ID STRING,
  Campaign_Name STRING,
  Campaign_Status STRING,
  Clicks INT64,
  Cost FLOAT64,
  Impressions INT64,
  Portfolio_Name STRING
);