// Power Query M — tabla Flota (Fase 2)

let
  BaseUrl = "http://192.168.12.67:3000",
  ApiKey = "PEGAR_POWER_BI_API_KEY_AQUI",
  Raw = Json.Document(
    Web.Contents(
      BaseUrl & "/api/bi/flota",
      [Headers = [#"Authorization" = "Bearer " & ApiKey]]
    )
  ),
  Items = Raw[items],
  AsTable = Table.FromList(Items, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
  Expanded = Table.ExpandRecordColumn(
    AsTable,
    "Column1",
    Record.FieldNames(Items{0})
  )
in
  Expanded
