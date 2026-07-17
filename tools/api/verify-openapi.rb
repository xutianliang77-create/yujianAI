#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

path = ARGV.fetch(0, "docs/api/openapi.yaml")
document = YAML.safe_load(File.read(path), aliases: true)
abort "OpenAPI document must be an object" unless document.is_a?(Hash)
abort "OpenAPI version must be 3.1.x" unless document["openapi"].to_s.start_with?("3.1.")
abort "OpenAPI info.version is required" unless document.dig("info", "version").is_a?(String)

paths = document["paths"]
abort "OpenAPI paths must be an object" unless paths.is_a?(Hash) && !paths.empty?
operation_ids = {}
operations = 0
paths.each do |path_template, path_item|
  abort "invalid OpenAPI path #{path_template}" unless path_template.start_with?("/") && path_item.is_a?(Hash)
  path_item.each do |method, operation|
    next if %w[$ref summary description parameters servers].include?(method) || method.start_with?("x-")
    abort "invalid operation #{method} #{path_template}" unless operation.is_a?(Hash)
    operation_id = operation["operationId"]
    abort "missing operationId for #{method} #{path_template}" unless operation_id.is_a?(String) && !operation_id.empty?
    abort "duplicate operationId #{operation_id}" if operation_ids.key?(operation_id)
    operation_ids[operation_id] = "#{method} #{path_template}"
    responses = operation["responses"]
    abort "missing responses for #{operation_id}" unless responses.is_a?(Hash) && !responses.empty?
    operations += 1
  end
end

resolve_pointer = lambda do |pointer|
  value = document
  pointer.delete_prefix("#/").split("/").each do |part|
    key = part.gsub("~1", "/").gsub("~0", "~")
    abort "unresolved local $ref #{pointer}" unless value.is_a?(Hash) && value.key?(key)
    value = value[key]
  end
end

walk = lambda do |value|
  case value
  when Hash
    resolve_pointer.call(value["$ref"]) if value["$ref"].is_a?(String) && value["$ref"].start_with?("#/")
    value.each_value { |child| walk.call(child) }
  when Array
    value.each { |child| walk.call(child) }
  end
end
walk.call(document)
puts "OpenAPI verified: #{operations} operations, #{operation_ids.length} unique operationIds"
