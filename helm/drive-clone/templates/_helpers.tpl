{{- define "drive-clone.name" -}}
{{- default .Chart.Name .Values.nameOverride }}
{{- end -}}

{{- define "drive-clone.fullname" -}}
{{- printf "%s" (include "drive-clone.name" .) -}}
{{- end -}}
