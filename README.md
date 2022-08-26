# jar-manifest-parser
Parse .jar files and write info to json file  (by RemixerDec)

// MULTI-CORE J2ME JAR HASHER + INFO EXTRACTOR | EXCLUDES EVERYTHING INSIDE MANIFEST FOLDER TO IGNORE MANIFEST-ONLY-CHANGES | (c) Remixer Dec 2020 | License: CC BY-NC 4.0
// использование: node jarhasher.js "C:/path/to/folder_with_jar_files_only_with_forward_slashes" CPU_LOGICAL_CORES OUTPUT_FILENAME ADD_SIMVEC ADD_ICONS
// установка: npm i jszip
// вывод в файл: [{"file":"имя_jar_файла","status":"статус распаковки, может быть success или fail","m-name":"midlet-имя","m-desc":"midlet-описание","m-vendor":"midlet-поставщик","m-icon":"иконка в base64","simvec":"вектор похожести (список crc32 внутри jar)","md5":"стандартный md5-хэш файла", "jsha":"очищенный от модификаций sha-1 хэш от crc32-сумм локально отсортированных файлов внутри jar-архива"},..]
//file и status выдаются всегда, если status равен success, также гарантируются хэши, остальное зависит от манифеста.