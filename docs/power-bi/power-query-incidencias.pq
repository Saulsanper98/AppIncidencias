// Power Query M — tabla Incidencias para Power BI (Fase 2)
// Uso: Power BI Desktop → Transformar datos → Nueva consulta → Consulta en blanca → Editor avanzado
// Ajusta BaseUrl y ApiKey. Crear parámetros Power BI es recomendable en producción.

let
  BaseUrl = "http://192.168.12.67:3000",
  ApiKey = "PEGAR_POWER_BI_API_KEY_AQUI",
  Range = "last365",
  PageSize = 5000,

  GetPage = (page as number) as list =>
    let
      Raw = Json.Document(
        Web.Contents(
          BaseUrl & "/api/bi/tickets",
          [
            Query = [
              range = Range,
              page = Number.ToText(page),
              pageSize = Number.ToText(PageSize)
            ],
            Headers = [#"Authorization" = "Bearer " & ApiKey]
          ]
        )
      ),
      Items = Raw[items],
      Pages = Raw[pages]
    in
      Items,

  First = Json.Document(
    Web.Contents(
      BaseUrl & "/api/bi/tickets",
      [
        Query = [range = Range, page = "1", pageSize = Number.ToText(PageSize)],
        Headers = [#"Authorization" = "Bearer " & ApiKey]
      ]
    )
  ),
  TotalPages = First[pages],

  AllPages = List.Generate(
    () => [i = 1, data = GetPage(1)],
    each [i] <= TotalPages,
    each [i = [i] + 1, data = GetPage([i] + 1)],
    each [data]
  ),
  AllItems = List.Combine(AllPages),
  AsTable = Table.FromList(AllItems, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
  Expanded = Table.ExpandRecordColumn(
    AsTable,
    "Column1",
    Record.FieldNames(AllItems{0})
  ),
  TypedDate = Table.TransformColumns(
    Expanded,
    {{"creado", each DateTime.From(_), type datetime}}
  ),
  WithFecha = Table.AddColumn(TypedDate, "Fecha", each Date.From([creado]), type date)
in
  WithFecha
