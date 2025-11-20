from google.cloud import bigquery

def inspect_schema():
    client = bigquery.Client(project='intercept-sales-2508061117')
    table_id = 'intercept-sales-2508061117.searchconsole_brickanew.searchdata_site_impression'
    
    try:
        table = client.get_table(table_id)
        print(f"Schema for {table_id}:")
        for schema in table.schema:
            print(f"{schema.name}: {schema.field_type}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_schema()

